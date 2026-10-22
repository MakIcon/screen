use crate::commands::errors::{CommandError, ErrorCode};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    future::Future,
};

use super::{ModrinthDependency, ModrinthVersion};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(super) enum VersionRequest {
    Project(String),
    Exact(String),
}

pub(super) struct InstallPlanEntry {
    pub version: ModrinthVersion,
    pub dependencies: Vec<String>,
}

pub(super) fn version_is_compatible(
    version: &ModrinthVersion,
    game_version: &str,
    loaders: &[&str],
) -> bool {
    version
        .game_versions
        .iter()
        .any(|value| value == game_version)
        && (loaders.is_empty()
            || version
                .loaders
                .iter()
                .any(|value| loaders.contains(&value.as_str())))
}

fn required_request(
    dependency: &ModrinthDependency,
    available_files: &HashSet<String>,
) -> Result<Option<VersionRequest>, CommandError> {
    if let Some(id) = dependency.version_id.as_deref().filter(|id| !id.is_empty()) {
        return Ok(Some(VersionRequest::Exact(id.to_string())));
    }
    if let Some(id) = dependency.project_id.as_deref().filter(|id| !id.is_empty()) {
        return Ok(Some(VersionRequest::Project(id.to_string())));
    }
    if let Some(filename) = dependency.file_name.as_deref() {
        if available_files.contains(filename) {
            return Ok(None);
        }
        return Err(CommandError::new(
            ErrorCode::InvalidInput,
            format!(
                "Обязательная зависимость {filename} отсутствует и не содержит ссылки на Modrinth"
            ),
        ));
    }
    Err(CommandError::new(
        ErrorCode::InvalidFile,
        "У обязательной зависимости отсутствует проект или версия Modrinth",
    ))
}

/// Resolve the entire required graph before downloading anything. Exact version
/// requirements take precedence over a project's latest or already installed
/// version; optional, embedded and incompatible entries are not downloads.
pub(super) async fn resolve_required_versions<F, Fut>(
    root: ModrinthVersion,
    game_version: &str,
    loaders: &[&str],
    available_files: &HashSet<String>,
    mut fetch: F,
) -> Result<Vec<InstallPlanEntry>, CommandError>
where
    F: FnMut(VersionRequest) -> Fut,
    Fut: Future<Output = Result<ModrinthVersion, CommandError>>,
{
    let root_project = root.project_id.clone();
    let root_version = root.id.clone();
    let mut pending = VecDeque::from([(None, root)]);
    let mut requests = VecDeque::new();
    let mut selected = HashMap::<String, ModrinthVersion>::new();
    let mut resolved = HashMap::<VersionRequest, ModrinthVersion>::new();
    let mut expanded = HashSet::new();

    loop {
        if let Some((request, version)) = pending.pop_front() {
            if version.id.is_empty() || version.project_id.is_empty() {
                return Err(CommandError::new(
                    ErrorCode::InvalidFile,
                    "Modrinth вернул зависимость без идентификатора проекта или версии",
                ));
            }
            if !version_is_compatible(&version, game_version, loaders) {
                return Err(CommandError::new(
                    ErrorCode::IncompatibleVersion,
                    format!(
                    "Версия {} мода {} несовместима с Minecraft {game_version} и загрузчиком {}",
                    version.version_number,
                    version.project_id,
                    loaders.join(", ")
                ),
                ));
            }
            if let Some(request) = request {
                match &request {
                    VersionRequest::Exact(id) if *id != version.id => {
                        return Err(CommandError::new(
                            ErrorCode::InvalidFile,
                            format!("Modrinth вернул другую версию вместо обязательной {id}"),
                        ));
                    }
                    VersionRequest::Project(id) if *id != version.project_id => {
                        return Err(CommandError::new(
                            ErrorCode::InvalidFile,
                            format!("Modrinth вернул другой проект вместо зависимости {id}"),
                        ));
                    }
                    _ => {}
                }
                resolved.insert(request, version.clone());
            }
            resolved.insert(VersionRequest::Exact(version.id.clone()), version.clone());
            if expanded.insert(version.id.clone()) {
                for dependency in &version.dependencies {
                    if dependency.dependency_type == "required" {
                        // An obsolete provisional version can have an unavailable
                        // external dependency. Validate those on the final graph.
                        if let Ok(Some(request)) = required_request(dependency, available_files) {
                            let exact = matches!(request, VersionRequest::Exact(_));
                            let queued = (version.project_id.clone(), version.id.clone(), request);
                            if exact {
                                requests.push_front(queued);
                            } else {
                                requests.push_back(queued);
                            }
                        }
                    }
                }
            }
            selected.insert(version.project_id.clone(), version);
            continue;
        }

        let Some((parent_project, parent_version, request)) = requests.pop_front() else {
            break;
        };
        if selected
            .get(&parent_project)
            .is_some_and(|version| version.id != parent_version)
        {
            continue;
        }
        if resolved.contains_key(&request) {
            continue;
        }
        if let VersionRequest::Project(id) = &request {
            if selected.contains_key(id) {
                continue;
            }
        }
        let version = fetch(request.clone()).await?;
        pending.push_back((Some(request), version));
    }

    // Only keep dependencies of the final selected versions. A pinned version
    // can replace a provisional latest version with a different dependency graph.
    let mut reachable = VecDeque::from([root_project.clone()]);
    let mut visited = HashSet::new();
    let mut plan = Vec::new();
    while let Some(project_id) = reachable.pop_front() {
        if !visited.insert(project_id.clone()) {
            continue;
        }
        let version = selected.get(&project_id).ok_or_else(|| {
            CommandError::new(
                ErrorCode::InvalidInput,
                format!("Не удалось найти обязательную зависимость {project_id}"),
            )
        })?;
        if project_id == root_project && version.id != root_version {
            return Err(CommandError::new(
                ErrorCode::IncompatibleVersion,
                "Зависимости требуют другую версию устанавливаемого мода",
            ));
        }
        let mut dependencies = Vec::new();
        for dependency in &version.dependencies {
            if dependency.dependency_type != "required" {
                continue;
            }
            let Some(request) = required_request(dependency, available_files).map_err(|error| {
                let detail = format!("{}: {error}", version.name);
                error.context(detail)
            })?
            else {
                continue;
            };
            let dependency_project = match &request {
                VersionRequest::Project(id) => id,
                VersionRequest::Exact(id) => {
                    let pinned = resolved.get(&request).ok_or_else(|| {
                        CommandError::new(
                            ErrorCode::InvalidInput,
                            format!("Не удалось найти обязательную версию {id}"),
                        )
                    })?;
                    if dependency
                        .project_id
                        .as_deref()
                        .filter(|id| !id.is_empty())
                        .is_some_and(|id| id != pinned.project_id)
                    {
                        return Err(CommandError::new(
                            ErrorCode::InvalidFile,
                            format!("Версия {id} принадлежит другому проекту зависимости"),
                        ));
                    }
                    let chosen = selected.get(&pinned.project_id).ok_or_else(|| {
                        CommandError::new(
                            ErrorCode::InvalidInput,
                            format!(
                                "Не удалось выбрать версию зависимости {}",
                                pinned.project_id
                            ),
                        )
                    })?;
                    if chosen.id != *id {
                        return Err(CommandError::new(ErrorCode::IncompatibleVersion, format!(
                            "Конфликт зависимостей: {} требует версию {id} мода {}, а другой мод требует {}",
                            version.name, pinned.project_id, chosen.id
                        )));
                    }
                    &pinned.project_id
                }
            };
            if !dependencies.contains(dependency_project) {
                dependencies.push(dependency_project.clone());
                reachable.push_back(dependency_project.clone());
            }
        }
        plan.push(InstallPlanEntry {
            version: version.clone(),
            dependencies,
        });
    }
    Ok(plan)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn version(project: &str, id: &str, dependencies: Vec<ModrinthDependency>) -> ModrinthVersion {
        ModrinthVersion {
            id: id.into(),
            project_id: project.into(),
            name: project.into(),
            version_number: id.into(),
            game_versions: vec!["1.21.1".into()],
            loaders: vec!["fabric".into()],
            dependencies,
            ..Default::default()
        }
    }

    fn dependency(project: Option<&str>, id: Option<&str>, kind: &str) -> ModrinthDependency {
        ModrinthDependency {
            project_id: project.map(str::to_string),
            version_id: id.map(str::to_string),
            dependency_type: kind.into(),
            ..Default::default()
        }
    }

    async fn resolve(
        root: ModrinthVersion,
        fixtures: Vec<(VersionRequest, ModrinthVersion)>,
    ) -> Result<Vec<InstallPlanEntry>, CommandError> {
        let mut fixtures: HashMap<_, _> = fixtures.into_iter().collect();
        resolve_required_versions(root, "1.21.1", &["fabric"], &HashSet::new(), |request| {
            // Removing fixtures also proves shared/cyclic dependencies are fetched once.
            let result = fixtures.remove(&request).ok_or_else(|| {
                CommandError::new(
                    ErrorCode::InvalidInput,
                    format!("Missing fixture {request:?}"),
                )
            });
            async move { result }
        })
        .await
    }

    #[tokio::test]
    async fn installs_nested_and_shared_required_dependencies_only() {
        let root = version(
            "root",
            "root-v1",
            vec![
                dependency(Some("api"), None, "required"),
                dependency(Some("helper"), None, "required"),
                dependency(Some("optional"), None, "optional"),
                dependency(Some("embedded"), None, "embedded"),
                dependency(Some("incompatible"), None, "incompatible"),
            ],
        );
        let plan = resolve(
            root,
            vec![
                (
                    VersionRequest::Project("api".into()),
                    version("api", "api-v1", vec![]),
                ),
                (
                    VersionRequest::Project("helper".into()),
                    version(
                        "helper",
                        "helper-v1",
                        vec![
                            dependency(Some("api"), None, "required"),
                            dependency(Some("nested"), None, "required"),
                        ],
                    ),
                ),
                (
                    VersionRequest::Project("nested".into()),
                    version("nested", "nested-v1", vec![]),
                ),
            ],
        )
        .await
        .unwrap();
        assert_eq!(
            plan.iter()
                .map(|entry| entry.version.project_id.as_str())
                .collect::<Vec<_>>(),
            ["root", "api", "helper", "nested"]
        );
    }

    #[tokio::test]
    async fn honours_exact_versions_with_or_without_project_ids() {
        let root = version(
            "root",
            "root-v1",
            vec![dependency(Some("api"), Some("api-pinned"), "required")],
        );
        let plan = resolve(
            root,
            vec![
                (
                    VersionRequest::Exact("api-pinned".into()),
                    version(
                        "api",
                        "api-pinned",
                        vec![dependency(None, Some("nested-pinned"), "required")],
                    ),
                ),
                (
                    VersionRequest::Exact("nested-pinned".into()),
                    version("nested", "nested-pinned", vec![]),
                ),
            ],
        )
        .await
        .unwrap();
        assert_eq!(plan[1].version.id, "api-pinned");
        assert_eq!(plan[1].dependencies, ["nested"]);
    }

    #[tokio::test]
    async fn later_pin_replaces_latest_and_discards_its_unneeded_dependencies() {
        let root = version(
            "root",
            "root-v1",
            vec![
                dependency(Some("api"), None, "required"),
                dependency(Some("helper"), None, "required"),
            ],
        );
        let plan = resolve(
            root,
            vec![
                (
                    VersionRequest::Project("api".into()),
                    version(
                        "api",
                        "latest",
                        vec![dependency(Some("unused"), None, "required")],
                    ),
                ),
                (
                    VersionRequest::Project("helper".into()),
                    version(
                        "helper",
                        "helper-v1",
                        vec![dependency(Some("api"), Some("pinned"), "required")],
                    ),
                ),
                (
                    VersionRequest::Exact("pinned".into()),
                    version("api", "pinned", vec![]),
                ),
            ],
        )
        .await
        .unwrap();
        assert_eq!(plan.len(), 3);
        assert_eq!(plan[1].version.id, "pinned");
    }

    #[tokio::test]
    async fn cyclic_dependencies_do_not_loop() {
        let root = version(
            "root",
            "root-v1",
            vec![dependency(Some("api"), None, "required")],
        );
        let plan = resolve(
            root,
            vec![(
                VersionRequest::Project("api".into()),
                version(
                    "api",
                    "api-v1",
                    vec![
                        dependency(Some("root"), None, "required"),
                        dependency(None, Some("api-v1"), "required"),
                    ],
                ),
            )],
        )
        .await
        .unwrap();
        assert_eq!(plan.len(), 2);
        assert_eq!(plan[1].dependencies, ["root", "api"]);
    }

    #[tokio::test]
    async fn conflicting_pins_fail_instead_of_installing_a_broken_graph() {
        let root = version(
            "root",
            "root-v1",
            vec![
                dependency(Some("api"), Some("one"), "required"),
                dependency(Some("api"), Some("two"), "required"),
            ],
        );
        let error = resolve(
            root,
            vec![
                (
                    VersionRequest::Exact("one".into()),
                    version("api", "one", vec![]),
                ),
                (
                    VersionRequest::Exact("two".into()),
                    version("api", "two", vec![]),
                ),
            ],
        )
        .await
        .err()
        .unwrap();
        assert_eq!(error.code, ErrorCode::IncompatibleVersion);
        assert!(error.detail.contains("Конфликт зависимостей"));
    }

    #[tokio::test]
    async fn unavailable_dependencies_are_not_silently_skipped() {
        let root = version(
            "root",
            "root-v1",
            vec![dependency(None, Some("missing"), "required")],
        );
        assert!(resolve(root, vec![]).await.is_err());
        let mut external = dependency(None, None, "required");
        external.file_name = Some("external.jar".into());
        assert!(resolve(version("root", "root-v1", vec![external]), vec![])
            .await
            .err()
            .unwrap()
            .detail
            .contains("external.jar"));
    }

    #[tokio::test]
    async fn pinned_dependencies_must_match_minecraft_and_loader() {
        for (game_version, loader) in [("1.20.1", "fabric"), ("1.21.1", "forge")] {
            let root = version(
                "root",
                "root-v1",
                vec![dependency(None, Some("wrong"), "required")],
            );
            let mut wrong = version("api", "wrong", vec![]);
            wrong.game_versions = vec![game_version.into()];
            wrong.loaders = vec![loader.into()];
            assert!(
                resolve(root, vec![(VersionRequest::Exact("wrong".into()), wrong)])
                    .await
                    .err()
                    .unwrap()
                    .detail
                    .contains("несовместима")
            );
        }
    }
}
