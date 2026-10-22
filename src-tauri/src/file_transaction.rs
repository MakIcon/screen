//! Small synchronous commit sections cannot be interrupted at an `.await`.
//! Every displaced file stays in the transaction until metadata is committed.
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

#[derive(serde::Serialize, serde::Deserialize)]
struct Change {
    filename: String,
    backup: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct Journal {
    changes: Vec<Change>,
    committed: bool,
}

pub(crate) struct FileTransaction {
    directory: PathBuf,
    target: PathBuf,
    changes: Vec<Change>,
    recorded: HashSet<PathBuf>,
    finished: bool,
}

impl FileTransaction {
    pub fn new(target: &Path) -> Result<Self, String> {
        Self::recover(target)?;
        let directory = target.join(format!(".screenlauncher-install-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(directory.join("staged"))
            .map_err(|e| format!("create staging directory error: {e}"))?;
        fs::create_dir(directory.join("rollback"))
            .map_err(|e| format!("create rollback directory error: {e}"))?;
        Ok(Self {
            directory,
            target: target.to_owned(),
            changes: Vec::new(),
            recorded: HashSet::new(),
            finished: false,
        })
    }

    pub fn staged(&self, filename: &str) -> PathBuf {
        self.directory.join("staged").join(filename)
    }

    /// Called under the build lock before reading metadata or changing files.
    pub fn recover(target: &Path) -> Result<(), String> {
        let entries = match fs::read_dir(target) {
            Ok(entries) => entries,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(e) => return Err(format!("read transaction directory error: {e}")),
        };
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry
                .file_name()
                .to_string_lossy()
                .starts_with(".screenlauncher-install-")
            {
                continue;
            }
            let directory = entry.path();
            let metadata = fs::symlink_metadata(&directory).map_err(|e| e.to_string())?;
            if !metadata.is_dir() || is_link(&metadata) {
                continue;
            }
            let journal = match fs::read(directory.join("journal.json")) {
                Ok(raw) => Some(serde_json::from_slice::<Journal>(&raw).map_err(|e| {
                    format!("read recovery journal {} error: {e}", directory.display())
                })?),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
                Err(e) => return Err(e.to_string()),
            };
            if let Some(journal) = journal {
                if !journal.committed {
                    for change in &journal.changes {
                        validate_name(&change.filename)?;
                        if let Some(name) = &change.backup {
                            validate_name(name)?;
                        }
                    }
                    let mut transaction = Self {
                        directory,
                        target: target.to_owned(),
                        changes: journal.changes,
                        recorded: HashSet::new(),
                        finished: false,
                    };
                    transaction.rollback()?;
                    continue;
                }
            }
            fs::remove_dir_all(&directory)
                .map_err(|e| format!("clean transaction directory error: {e}"))?;
        }
        Ok(())
    }

    fn save_journal(&self, committed: bool) -> Result<(), String> {
        let raw = serde_json::to_vec(
            &serde_json::json!({ "changes": self.changes, "committed": committed }),
        )
        .map_err(|e| format!("serialize rollback journal error: {e}"))?;
        crate::paths::atomic_write_path_sync(&self.directory.join("journal.json"), &raw)
    }

    fn preserve(&mut self, filename: &str, keep_original: bool) -> Result<PathBuf, String> {
        validate_name(filename)?;
        let destination = self.target.join(filename);
        if self.recorded.contains(&destination) {
            return Ok(destination);
        }
        let backup = match fs::symlink_metadata(&destination) {
            Ok(metadata) => {
                if !metadata.is_file() || is_link(&metadata) {
                    return Err(format!("Cannot replace non-file {}", destination.display()));
                }
                let name = self.changes.len().to_string();
                if keep_original {
                    let backup = self.directory.join("rollback").join(&name);
                    fs::copy(&destination, &backup)
                        .map_err(|e| format!("back up {} error: {e}", destination.display()))?;
                    fs::OpenOptions::new()
                        .write(true)
                        .open(&backup)
                        .and_then(|file| file.sync_all())
                        .map_err(|e| format!("sync rollback copy error: {e}"))?;
                }
                Some(name)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(format!("inspect {} error: {e}", destination.display())),
        };
        self.changes.push(Change {
            filename: filename.to_owned(),
            backup: backup.clone(),
        });
        if let Err(error) = self.save_journal(false) {
            self.changes.pop();
            return Err(error);
        }
        self.recorded.insert(destination.clone());
        if !keep_original {
            if let Some(backup) = backup {
                fs::rename(&destination, self.directory.join("rollback").join(backup))
                    .map_err(|e| format!("back up {} error: {e}", destination.display()))?;
            }
        }
        Ok(destination)
    }

    pub fn remove(&mut self, filename: &str) -> Result<(), String> {
        self.preserve(filename, false).map(|_| ())
    }

    pub fn replace(&mut self, source: &Path, filename: &str) -> Result<(), String> {
        let destination = self.preserve(filename, false)?;
        fs::rename(source, &destination).map_err(|e| format!("install {filename} error: {e}"))
    }

    pub fn write(&mut self, filename: &str, bytes: &[u8]) -> Result<(), String> {
        // JSON readers keep seeing the previous complete document until rename.
        let destination = self.preserve(filename, true)?;
        crate::paths::atomic_write_path_sync(&destination, bytes)
    }

    pub fn commit(mut self) -> Result<(), String> {
        if let Err(error) = self.save_journal(true) {
            return match self.rollback() {
                Ok(()) => Err(error),
                Err(rollback) => Err(format!("{error}; {rollback}")),
            };
        }
        self.finished = true;
        let _ = fs::remove_dir_all(&self.directory);
        Ok(())
    }

    pub fn rollback(&mut self) -> Result<(), String> {
        let mut errors = Vec::new();
        // Retain failed journal entries and backups for a later recovery attempt.
        for index in (0..self.changes.len()).rev() {
            let change = &self.changes[index];
            let destination = self.target.join(&change.filename);
            let backup = change
                .backup
                .as_ref()
                .map(|name| self.directory.join("rollback").join(name));
            // A journal entry is synced before moving an original. If the move
            // never happened (or it was already restored), leave it alone.
            if backup.as_ref().is_some_and(|path| !path.exists()) {
                self.changes.remove(index);
                continue;
            }
            match fs::remove_file(&destination) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => {
                    errors.push(format!("{}: {e}", destination.display()));
                    continue;
                }
            }
            if let Some(backup) = backup {
                if let Err(e) = fs::rename(backup, &destination) {
                    errors.push(format!("{}: {e}", destination.display()));
                    continue;
                }
            }
            self.changes.remove(index);
        }
        if errors.is_empty() {
            self.finished = true;
            let _ = fs::remove_dir_all(&self.directory);
            Ok(())
        } else {
            Err(format!(
                "rollback failed: {}; previous files retained at {}",
                errors.join("; "),
                self.directory.display()
            ))
        }
    }
}

impl Drop for FileTransaction {
    fn drop(&mut self) {
        if !self.finished {
            if let Err(error) = self.rollback() {
                eprintln!("{error}");
            }
        }
    }
}

fn validate_name(name: &str) -> Result<(), String> {
    let mut parts = Path::new(name).components();
    if name.contains(['/', '\\', ':'])
        || !matches!(parts.next(), Some(std::path::Component::Normal(_)))
        || parts.next().is_some()
    {
        return Err("Invalid transaction filename".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Directory(PathBuf);
    impl Directory {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("screen-transaction-{}", uuid::Uuid::new_v4()));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Directory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn rolls_back_replacements_deletions_new_files_and_metadata_together() {
        let directory = Directory::new();
        for name in ["same.jar", "old.jar.disabled", "state.json"] {
            fs::write(directory.0.join(name), b"old").unwrap();
        }
        {
            let mut transaction = FileTransaction::new(&directory.0).unwrap();
            for name in ["same.jar", "new.jar"] {
                let staged = transaction.staged(name);
                fs::write(&staged, b"new").unwrap();
                transaction.replace(&staged, name).unwrap();
            }
            transaction.remove("old.jar.disabled").unwrap();
            transaction.write("state.json", b"new metadata").unwrap();
            // Simulate cancellation before commit.
        }
        for name in ["same.jar", "old.jar.disabled", "state.json"] {
            assert_eq!(fs::read(directory.0.join(name)).unwrap(), b"old");
        }
        assert!(!directory.0.join("new.jar").exists());
        assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 3);
    }

    #[test]
    fn recovers_an_interrupted_commit_from_the_disk_journal() {
        let directory = Directory::new();
        fs::write(directory.0.join("mod.jar"), b"old").unwrap();
        let mut transaction = FileTransaction::new(&directory.0).unwrap();
        let staged = transaction.staged("mod.jar");
        fs::write(&staged, b"new").unwrap();
        transaction.replace(&staged, "mod.jar").unwrap();
        transaction.write("state.json", b"new metadata").unwrap();
        // Suppress Drop as if the launcher was terminated during commit.
        std::mem::forget(transaction);
        FileTransaction::recover(&directory.0).unwrap();
        assert_eq!(fs::read(directory.0.join("mod.jar")).unwrap(), b"old");
        assert!(!directory.0.join("state.json").exists());
        assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 1);
    }

    #[test]
    fn recovery_preserves_a_successfully_committed_transaction() {
        let directory = Directory::new();
        fs::write(directory.0.join("state.json"), b"old").unwrap();
        let mut transaction = FileTransaction::new(&directory.0).unwrap();
        transaction.write("state.json", b"new").unwrap();
        transaction.save_journal(true).unwrap();
        std::mem::forget(transaction);
        FileTransaction::recover(&directory.0).unwrap();
        assert_eq!(fs::read(directory.0.join("state.json")).unwrap(), b"new");
        assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 1);
    }

    #[test]
    fn failed_later_replacement_restores_earlier_changes() {
        let directory = Directory::new();
        fs::write(directory.0.join("mod.jar"), b"old").unwrap();
        fs::create_dir(directory.0.join("blocked.jar")).unwrap();
        let mut transaction = FileTransaction::new(&directory.0).unwrap();
        let staged = transaction.staged("mod.jar");
        fs::write(&staged, b"new").unwrap();
        transaction.replace(&staged, "mod.jar").unwrap();
        assert!(transaction.replace(&staged, "blocked.jar").is_err());
        transaction.rollback().unwrap();
        assert_eq!(fs::read(directory.0.join("mod.jar")).unwrap(), b"old");
        assert!(directory.0.join("blocked.jar").is_dir());
    }
}

fn is_link(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}
