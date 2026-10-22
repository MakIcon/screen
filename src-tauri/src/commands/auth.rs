use crate::commands::errors::{CommandError, ErrorCode};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::{multipart, Client, Response, StatusCode};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::{oneshot, Mutex as AsyncMutex};
use tokio::time::{sleep, Duration};

use url::form_urlencoded;

use crate::{
    models::{MicrosoftAccount, MicrosoftAccountSummary, MinecraftProfile},
    paths::{account_secrets_root, accounts_path},
    secure_storage,
};

fn encode_form(pairs: &[(&str, &str)]) -> String {
    let mut ser = form_urlencoded::Serializer::new(String::new());
    for (k, v) in pairs {
        ser.append_pair(k, v);
    }
    ser.finish()
}

const MS_CLIENT_ID: &str = "00000000402b5328";
const MS_REDIRECT_URI: &str = "https://login.live.com/oauth20_desktop.srf";
const MS_SCOPE: &str = "service::user.auth.xboxlive.com::MBI_SSL";
const MS_AUTH_URL: &str = "https://login.live.com/oauth20_authorize.srf";
const MS_TOKEN_URL: &str = "https://login.live.com/oauth20_token.srf";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
const PROFILE_RETRY_DELAYS_MS: [u64; 2] = [250, 750];

static ACCOUNTS_LOCK: OnceLock<AsyncMutex<()>> = OnceLock::new();

fn should_retry_profile_status(status: StatusCode) -> bool {
    status == StatusCode::NOT_FOUND
        || status == StatusCode::REQUEST_TIMEOUT
        || status == StatusCode::TOO_MANY_REQUESTS
        || status.is_server_error()
}

// ── Serialization helpers ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct MsTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
}

#[derive(Debug, Serialize)]
struct XblProperties {
    #[serde(rename = "AuthMethod")]
    auth_method: String,
    #[serde(rename = "SiteName")]
    site_name: String,
    #[serde(rename = "RpsTicket")]
    rps_ticket: String,
}

#[derive(Debug, Serialize)]
struct XblRequest {
    #[serde(rename = "Properties")]
    properties: XblProperties,
    #[serde(rename = "RelyingParty")]
    relying_party: String,
    #[serde(rename = "TokenType")]
    token_type: String,
}

#[derive(Debug, Deserialize)]
struct XblResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: XblDisplayClaims,
}

#[derive(Debug, Deserialize)]
struct XblDisplayClaims {
    xui: Vec<XblXui>,
}

#[derive(Debug, Deserialize)]
struct XblXui {
    uhs: String,
}

#[derive(Debug, Serialize)]
struct XstsProperties {
    #[serde(rename = "SandboxId")]
    sandbox_id: String,
    #[serde(rename = "UserTokens")]
    user_tokens: Vec<String>,
}

#[derive(Debug, Serialize)]
struct XstsRequest {
    #[serde(rename = "Properties")]
    properties: XstsProperties,
    #[serde(rename = "RelyingParty")]
    relying_party: String,
    #[serde(rename = "TokenType")]
    token_type: String,
}

#[derive(Debug, Deserialize)]
struct XstsResponse {
    #[serde(rename = "Token")]
    token: String,
    #[allow(dead_code)]
    #[serde(rename = "DisplayClaims")]
    display_claims: XblDisplayClaims,
}

#[derive(Debug, Serialize)]
struct McLoginRequest {
    #[serde(rename = "identityToken")]
    identity_token: String,
}

#[derive(Debug, Deserialize)]
struct McLoginResponse {
    access_token: String,
    expires_in: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct McProfileResponse {
    id: String,
    name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CapeSelectionRequest {
    cape_id: String,
}

#[derive(Debug)]
enum XblAuthError {
    Request(String),
    Http { status: StatusCode, body: String },
    Parse(String),
    MissingUserHash,
}

impl XblAuthError {
    fn is_unauthorized(&self) -> bool {
        matches!(
            self,
            Self::Http {
                status: StatusCode::UNAUTHORIZED,
                ..
            }
        )
    }

    fn into_message(self) -> CommandError {
        let code = if matches!(&self, Self::Request(_)) {
            ErrorCode::Network
        } else {
            ErrorCode::Authentication
        };
        CommandError::new(
            code,
            match self {
                Self::Request(err) => format!("XBL request: {err}"),
                Self::Http { status, body } => {
                    if status == StatusCode::UNAUTHORIZED {
                        format!(
                        "XBL error {status}: Microsoft token was rejected by Xbox Live. Try signing in again, and make sure the account has an Xbox profile. Details: {body}"
                    )
                    } else {
                        format!("XBL error {status}: {body}")
                    }
                }
                Self::Parse(err) => format!("XBL parse: {err}"),
                Self::MissingUserHash => "XBL: no user hash".to_string(),
            },
        )
    }
}

// ── Storage ───────────────────────────────────────────────────────────────────

fn accounts_lock() -> &'static AsyncMutex<()> {
    ACCOUNTS_LOCK.get_or_init(|| AsyncMutex::new(()))
}

fn sidecar_path(path: &Path, suffix: &str) -> PathBuf {
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "accounts.json".to_string());
    path.with_file_name(format!("{file_name}{suffix}"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredMicrosoftAccount {
    id: String,
    uuid: String,
    username: String,
    expires_at: u64,
    // Read legacy plaintext fields during migration, but never serialize them.
    #[serde(default, skip_serializing)]
    access_token: String,
    #[serde(default, skip_serializing)]
    refresh_token: String,
}

impl From<&MicrosoftAccount> for StoredMicrosoftAccount {
    fn from(account: &MicrosoftAccount) -> Self {
        Self {
            id: account.id.clone(),
            uuid: account.uuid.clone(),
            username: account.username.clone(),
            expires_at: account.expires_at,
            access_token: String::new(),
            refresh_token: String::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountSecrets {
    access_token: String,
    refresh_token: String,
}

async fn read_account_file(
    path: &Path,
) -> Result<Option<Vec<StoredMicrosoftAccount>>, CommandError> {
    let raw = match tokio::fs::read_to_string(path).await {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err({
                let detail = format!("read {}: {error}", path.display());
                CommandError::from(error).context(detail)
            })
        }
    };

    serde_json::from_str(&raw).map(Some).map_err(|error| {
        let detail = format!("parse {}: {error}", path.display());
        CommandError::from(error).context(detail)
    })
}

async fn read_account_metadata_unlocked() -> Result<Vec<StoredMicrosoftAccount>, CommandError> {
    let path = accounts_path()?;
    let primary_error = match read_account_file(&path).await {
        Ok(Some(accounts)) => return Ok(accounts),
        Ok(None) => None,
        Err(error) => Some(error),
    };

    // Recover from an interrupted atomic replacement or the last known-good backup.
    let mut recovery_errors = Vec::new();
    for recovery_path in [sidecar_path(&path, ".tmp"), sidecar_path(&path, ".bak")] {
        match read_account_file(&recovery_path).await {
            Ok(Some(accounts)) => return Ok(accounts),
            Ok(None) => {}
            Err(error) => recovery_errors.push(error),
        }
    }

    if let Some(primary_error) = primary_error {
        let recovery_details = if recovery_errors.is_empty() {
            String::new()
        } else {
            format!(
                "; recovery failed: {}",
                recovery_errors
                    .iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
                    .join("; ")
            )
        };
        return Err(CommandError::new(
            primary_error.code,
            format!("{primary_error}{recovery_details}"),
        ));
    }

    Ok(Vec::new())
}

fn account_secret_path(account_id: &str) -> Result<PathBuf, CommandError> {
    uuid::Uuid::parse_str(account_id).map_err(|_| {
        CommandError::new(
            ErrorCode::Authentication,
            "Invalid Microsoft account ID in secure storage",
        )
    })?;
    Ok(account_secrets_root()?.join(format!("{account_id}.bin")))
}

fn decrypt_account_secrets(encrypted: &[u8]) -> Result<AccountSecrets, CommandError> {
    let plaintext = secure_storage::unprotect(encrypted)?;
    serde_json::from_slice(&plaintext).map_err(|error| {
        let detail = format!("parse account secret: {error}");
        CommandError::from(error).context(detail)
    })
}

async fn read_account_secret(account_id: &str) -> Result<Option<AccountSecrets>, CommandError> {
    let path = account_secret_path(account_id)?;
    let mut errors = Vec::new();

    for candidate in [&path, &sidecar_path(&path, ".bak")] {
        let encrypted = match tokio::fs::read(candidate).await {
            Ok(encrypted) => encrypted,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                errors.push(format!("read {}: {error}", candidate.display()));
                continue;
            }
        };
        match decrypt_account_secrets(&encrypted) {
            Ok(secrets) => return Ok(Some(secrets)),
            Err(error) => errors.push(format!("{}: {error}", candidate.display())),
        }
    }

    if errors.is_empty() {
        Ok(None)
    } else {
        Err(CommandError::new(
            ErrorCode::Authentication,
            format!("Unable to unlock Microsoft account: {}", errors.join("; ")),
        ))
    }
}

async fn atomic_write(path: &Path, data: &[u8]) -> Result<(), CommandError> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|error| {
            let detail = format!("create account directory: {error}");
            CommandError::from(error).context(detail)
        })?;
    }

    let temporary_path = sidecar_path(path, ".tmp");
    let result = async {
        tokio::fs::write(&temporary_path, data)
            .await
            .map_err(|error| {
                let detail = format!("write {}: {error}", temporary_path.display());
                CommandError::from(error).context(detail)
            })?;
        let temporary_file = tokio::fs::OpenOptions::new()
            .write(true)
            .open(&temporary_path)
            .await
            .map_err(|error| {
                let detail = format!("open {}: {error}", temporary_path.display());
                CommandError::from(error).context(detail)
            })?;
        temporary_file.sync_all().await.map_err(|error| {
            let detail = format!("sync {}: {error}", temporary_path.display());
            CommandError::from(error).context(detail)
        })?;
        drop(temporary_file);
        tokio::fs::rename(&temporary_path, path)
            .await
            .map_err(|error| {
                let detail = format!("replace {}: {error}", path.display());
                CommandError::from(error).context(detail)
            })
    }
    .await;

    if result.is_err() {
        let _ = tokio::fs::remove_file(&temporary_path).await;
    }
    result
}

async fn write_account_secret(account: &MicrosoftAccount) -> Result<(), CommandError> {
    let path = account_secret_path(&account.id)?;
    let plaintext = serde_json::to_vec(&AccountSecrets {
        access_token: account.access_token.clone(),
        refresh_token: account.refresh_token.clone(),
    })
    .map_err(|error| {
        let detail = format!("serialize account secret: {error}");
        CommandError::from(error).context(detail)
    })?;
    let encrypted = secure_storage::protect(&plaintext)?;

    // Keep the previous valid encrypted token as a recovery copy.
    if let Ok(previous) = tokio::fs::read(&path).await {
        if decrypt_account_secrets(&previous).is_ok() {
            atomic_write(&sidecar_path(&path, ".bak"), &previous).await?;
        }
    }

    atomic_write(&path, &encrypted).await
}

async fn cleanup_removed_account_secrets(active_ids: &[String]) -> Result<(), CommandError> {
    let root = account_secrets_root()?;
    let mut entries = match tokio::fs::read_dir(&root).await {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err({
                let detail = format!("read account secrets directory: {error}");
                CommandError::from(error).context(detail)
            })
        }
    };

    while let Some(entry) = entries.next_entry().await.map_err(|error| {
        let detail = format!("read account secret entry: {error}");
        CommandError::from(error).context(detail)
    })? {
        let file_name = entry.file_name().to_string_lossy().into_owned();
        let Some((account_id, _)) = file_name.split_once(".bin") else {
            continue;
        };
        if !active_ids.iter().any(|id| id == account_id) {
            tokio::fs::remove_file(entry.path())
                .await
                .map_err(|error| {
                    let detail = format!("remove stale account secret: {error}");
                    CommandError::from(error).context(detail)
                })?;
        }
    }
    Ok(())
}

async fn write_accounts_unlocked(accounts: &[MicrosoftAccount]) -> Result<(), CommandError> {
    let path = accounts_path()?;
    for account in accounts {
        write_account_secret(account).await?;
    }

    let metadata: Vec<_> = accounts.iter().map(StoredMicrosoftAccount::from).collect();
    let raw = serde_json::to_vec_pretty(&metadata).map_err(|e| {
        let detail = format!("serialize accounts: {e}");
        CommandError::from(e).context(detail)
    })?;

    // Never let a malformed primary file overwrite a usable recovery copy.
    if let Ok(Some(previous_accounts)) = read_account_file(&path).await {
        let backup = serde_json::to_vec_pretty(&previous_accounts).map_err(|error| {
            let detail = format!("serialize accounts backup: {error}");
            CommandError::from(error).context(detail)
        })?;
        atomic_write(&sidecar_path(&path, ".bak"), &backup).await?;
    }

    atomic_write(&path, &raw).await?;
    // Also sanitize a legacy recovery file that may have been used because the
    // primary metadata was damaged. No plaintext token copy is left behind.
    atomic_write(&sidecar_path(&path, ".bak"), &raw).await?;
    let active_ids: Vec<_> = accounts.iter().map(|account| account.id.clone()).collect();
    cleanup_removed_account_secrets(&active_ids).await
}

async fn read_accounts_unlocked() -> Result<Vec<MicrosoftAccount>, CommandError> {
    let stored_accounts = read_account_metadata_unlocked().await?;
    let mut accounts = Vec::with_capacity(stored_accounts.len());
    let mut needs_migration = false;

    for stored in stored_accounts {
        let legacy_secrets = (!stored.access_token.is_empty() || !stored.refresh_token.is_empty())
            .then(|| AccountSecrets {
                access_token: stored.access_token.clone(),
                refresh_token: stored.refresh_token.clone(),
            });
        let secrets = match read_account_secret(&stored.id).await {
            Ok(Some(secrets)) => secrets,
            Ok(None) => {
                needs_migration = true;
                legacy_secrets.ok_or_else(|| {
                    CommandError::new(
                        ErrorCode::Authentication,
                        format!(
                            "Secure tokens are missing for Microsoft account {}. Sign in again.",
                            stored.username
                        ),
                    )
                })?
            }
            Err(_) if legacy_secrets.is_some() => {
                needs_migration = true;
                legacy_secrets.unwrap()
            }
            Err(error) => return Err(error),
        };

        accounts.push(MicrosoftAccount {
            id: stored.id,
            uuid: stored.uuid,
            username: stored.username,
            access_token: secrets.access_token,
            refresh_token: secrets.refresh_token,
            expires_at: stored.expires_at,
        });
    }

    if needs_migration {
        // Secrets are written first. Only after every DPAPI write succeeds is
        // the legacy plaintext metadata replaced and its backup sanitized.
        write_accounts_unlocked(&accounts).await?;
    }

    Ok(accounts)
}

pub async fn read_accounts() -> Result<Vec<MicrosoftAccount>, CommandError> {
    let _guard = accounts_lock().lock().await;
    read_accounts_unlocked().await
}

pub async fn write_accounts(accounts: &[MicrosoftAccount]) -> Result<(), CommandError> {
    let _guard = accounts_lock().lock().await;
    write_accounts_unlocked(accounts).await
}

// ── Auth steps ────────────────────────────────────────────────────────────────

async fn post_form(
    client: &Client,
    url: &str,
    pairs: &[(&str, &str)],
) -> Result<reqwest::Response, CommandError> {
    let body = encode_form(pairs);
    client
        .post(url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await
        .map_err(|e| {
            let detail = format!("POST {url}: {e}");
            CommandError::from(e).context(detail)
        })
}

async fn exchange_code(client: &Client, code: &str) -> Result<MsTokenResponse, CommandError> {
    let resp = post_form(
        client,
        MS_TOKEN_URL,
        &[
            ("client_id", MS_CLIENT_ID),
            ("code", code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", MS_REDIRECT_URI),
            ("scope", MS_SCOPE),
        ],
    )
    .await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(CommandError::new(
            ErrorCode::Authentication,
            format!("MS token error {status}: {body}"),
        ));
    }
    resp.json::<MsTokenResponse>().await.map_err(|e| {
        let detail = format!("MS token parse: {e}");
        CommandError::from(e).context(detail)
    })
}

async fn refresh_ms_token(
    client: &Client,
    refresh_token: &str,
) -> Result<MsTokenResponse, CommandError> {
    let resp = post_form(
        client,
        MS_TOKEN_URL,
        &[
            ("client_id", MS_CLIENT_ID),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
            ("scope", MS_SCOPE),
        ],
    )
    .await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(CommandError::new(
            ErrorCode::Authentication,
            format!("MS refresh error {status}: {body}"),
        ));
    }
    resp.json::<MsTokenResponse>().await.map_err(|e| {
        let detail = format!("MS refresh parse: {e}");
        CommandError::from(e).context(detail)
    })
}

async fn request_xbl_token(
    client: &Client,
    rps_ticket: &str,
) -> Result<(String, String), XblAuthError> {
    let req = XblRequest {
        properties: XblProperties {
            auth_method: "RPS".into(),
            site_name: "user.auth.xboxlive.com".into(),
            rps_ticket: rps_ticket.to_string(),
        },
        relying_party: "http://auth.xboxlive.com".into(),
        token_type: "JWT".into(),
    };
    let resp = client
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .header("Accept", "application/json")
        .json(&req)
        .send()
        .await
        .map_err(|e| XblAuthError::Request(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(XblAuthError::Http { status, body });
    }
    let data = resp
        .json::<XblResponse>()
        .await
        .map_err(|e| XblAuthError::Parse(e.to_string()))?;
    let uhs = data
        .display_claims
        .xui
        .into_iter()
        .next()
        .ok_or(XblAuthError::MissingUserHash)?
        .uhs;
    Ok((data.token, uhs))
}

fn with_rps_preamble(ms_access_token: &str, preamble: &str) -> String {
    if ms_access_token.starts_with("t=") || ms_access_token.starts_with("d=") {
        ms_access_token.to_string()
    } else {
        format!("{preamble}={ms_access_token}")
    }
}

async fn get_xbl_token(
    client: &Client,
    ms_access_token: &str,
) -> Result<(String, String), CommandError> {
    // The MBI_SSL Live token is an RPS ticket and Xbox Live expects the t= preamble.
    // Keep d= as a fallback for Azure OAuth tokens used by other Minecraft auth flows.
    let rps_tickets = [
        with_rps_preamble(ms_access_token, "t"),
        with_rps_preamble(ms_access_token, "d"),
    ];

    let mut last_error = None;
    for (idx, rps_ticket) in rps_tickets.iter().enumerate() {
        match request_xbl_token(client, rps_ticket).await {
            Ok(token) => return Ok(token),
            Err(err) if err.is_unauthorized() && idx + 1 < rps_tickets.len() => {
                last_error = Some(err);
            }
            Err(err) => return Err(err.into_message()),
        }
    }

    Err(last_error
        .map(XblAuthError::into_message)
        .unwrap_or_else(|| {
            CommandError::new(
                ErrorCode::Authentication,
                "XBL error: token exchange failed",
            )
        }))
}

async fn get_xsts_token(client: &Client, xbl_token: &str) -> Result<String, CommandError> {
    let req = XstsRequest {
        properties: XstsProperties {
            sandbox_id: "RETAIL".into(),
            user_tokens: vec![xbl_token.to_string()],
        },
        relying_party: "rp://api.minecraftservices.com/".into(),
        token_type: "JWT".into(),
    };
    let resp = client
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .header("Accept", "application/json")
        .json(&req)
        .send()
        .await
        .map_err(|e| {
            let detail = format!("XSTS request: {e}");
            CommandError::from(e).context(detail)
        })?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        // Give a helpful message for common XSTS errors
        if body.contains("2148916238") {
            return Err(CommandError::new(
                ErrorCode::Authentication,
                "Microsoft account is not available in your region",
            ));
        }
        if body.contains("2148916233") {
            return Err(CommandError::new(ErrorCode::Authentication, "This Microsoft account doesn't have an Xbox account. Please create one at xbox.com"));
        }
        if body.contains("2148916235") {
            return Err(CommandError::new(
                ErrorCode::Unsupported,
                "Child accounts are not supported",
            ));
        }
        return Err(CommandError::new(
            ErrorCode::Authentication,
            format!("XSTS error {status}: {body}"),
        ));
    }
    let data = resp.json::<XstsResponse>().await.map_err(|e| {
        let detail = format!("XSTS parse: {e}");
        CommandError::from(e).context(detail)
    })?;
    Ok(data.token)
}

async fn get_minecraft_token(
    client: &Client,
    uhs: &str,
    xsts_token: &str,
) -> Result<(String, u64), CommandError> {
    let req = McLoginRequest {
        identity_token: format!("XBL3.0 x={uhs};{xsts_token}"),
    };
    let resp = client
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&req)
        .send()
        .await
        .map_err(|e| {
            let detail = format!("MC auth request: {e}");
            CommandError::from(e).context(detail)
        })?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(CommandError::new(
            ErrorCode::Authentication,
            format!("MC auth error {status}: {body}"),
        ));
    }
    let data = resp.json::<McLoginResponse>().await.map_err(|e| {
        let detail = format!("MC auth parse: {e}");
        CommandError::from(e).context(detail)
    })?;
    Ok((data.access_token, data.expires_in.unwrap_or(86400)))
}

async fn get_minecraft_profile_from_token(
    client: &Client,
    mc_token: &str,
) -> Result<McProfileResponse, CommandError> {
    let mut retry_index = 0;
    loop {
        let resp = client
            .get(MC_PROFILE_URL)
            .header("Authorization", format!("Bearer {mc_token}"))
            .send()
            .await
            .map_err(|e| {
                let detail = format!("MC profile request: {e}");
                CommandError::from(e).context(detail)
            })?;
        let status = resp.status();
        if status.is_success() {
            return resp.json::<McProfileResponse>().await.map_err(|e| {
                let detail = format!("MC profile parse: {e}");
                CommandError::from(e).context(detail)
            });
        }

        let body = resp.text().await.unwrap_or_default();
        if should_retry_profile_status(status) && retry_index < PROFILE_RETRY_DELAYS_MS.len() {
            let delay = PROFILE_RETRY_DELAYS_MS[retry_index];
            retry_index += 1;
            sleep(Duration::from_millis(delay)).await;
            continue;
        }
        return Err(CommandError::new(
            ErrorCode::Authentication,
            format!("MC profile error {status}: {body}"),
        ));
    }
}

fn format_uuid(raw: &str) -> String {
    if raw.len() == 32 {
        format!(
            "{}-{}-{}-{}-{}",
            &raw[0..8],
            &raw[8..12],
            &raw[12..16],
            &raw[16..20],
            &raw[20..32]
        )
    } else {
        raw.to_string()
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn build_auth_url(state: &str) -> String {
    let query = encode_form(&[
        ("client_id", MS_CLIENT_ID),
        ("response_type", "code"),
        ("scope", MS_SCOPE),
        ("redirect_uri", MS_REDIRECT_URI),
        ("prompt", "select_account"),
        ("state", state),
    ]);
    format!("{MS_AUTH_URL}?{query}")
}

fn is_microsoft_callback(url: &url::Url) -> bool {
    // Compare parsed URL components, never a string prefix. Userinfo, alternate
    // ports, suffixes, and paths resembling the redirect are not callbacks.
    let expected = url::Url::parse(MS_REDIRECT_URI).expect("valid static Microsoft redirect URI");
    url.scheme() == expected.scheme()
        && url.host_str() == expected.host_str()
        && url.port_or_known_default() == expected.port_or_known_default()
        && url.path() == expected.path()
        && url.username().is_empty()
        && url.password().is_none()
}

fn microsoft_callback_code(url: &url::Url, expected_state: &str) -> Result<String, CommandError> {
    if !is_microsoft_callback(url) || url.fragment().is_some() {
        return Err(CommandError::new(
            ErrorCode::Authentication,
            "Invalid Microsoft sign-in callback address",
        ));
    }
    let mut parameters = std::collections::HashMap::new();
    for (key, value) in url.query_pairs() {
        if matches!(key.as_ref(), "state" | "code" | "error")
            && parameters
                .insert(key.into_owned(), value.into_owned())
                .is_some()
        {
            return Err(CommandError::new(
                ErrorCode::Authentication,
                "Duplicate Microsoft sign-in callback parameter",
            ));
        }
    }
    // Check state for both successful and failed authorization responses. Never
    // include the URL, state, or authorization code in the diagnostic message.
    if expected_state.is_empty()
        || parameters.get("state").map(String::as_str) != Some(expected_state)
    {
        return Err(CommandError::new(
            ErrorCode::Authentication,
            "Microsoft sign-in state mismatch; start sign-in again",
        ));
    }
    if parameters.contains_key("code") && parameters.contains_key("error") {
        return Err(CommandError::new(
            ErrorCode::Authentication,
            "Invalid Microsoft sign-in response",
        ));
    }
    if let Some(error) = parameters.get("error") {
        return Err(CommandError::new(
            if error == "access_denied" {
                ErrorCode::Cancelled
            } else {
                ErrorCode::Authentication
            },
            if error == "access_denied" {
                "Sign-in cancelled"
            } else {
                "Microsoft rejected the sign-in request"
            },
        ));
    }
    parameters
        .remove("code")
        .filter(|code| !code.trim().is_empty())
        .ok_or_else(|| {
            CommandError::new(
                ErrorCode::Authentication,
                "No auth code in Microsoft sign-in callback",
            )
        })
}

/// A fresh unpredictable state and a single-use reply belong to one login
/// window. A callback from an earlier window cannot complete a later attempt.
struct MicrosoftAuthCallback {
    state: String,
    reply: Option<oneshot::Sender<Result<String, CommandError>>>,
}

impl MicrosoftAuthCallback {
    fn new(reply: oneshot::Sender<Result<String, CommandError>>) -> Self {
        Self {
            state: format!(
                "{}{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            ),
            reply: Some(reply),
        }
    }

    fn on_navigation(&mut self, url: &url::Url) -> bool {
        if !is_microsoft_callback(url) {
            return true;
        }
        if let Some(reply) = self.reply.take() {
            let _ = reply.send(microsoft_callback_code(url, &self.state));
        }
        false
    }

    fn cancel(&mut self) {
        if let Some(reply) = self.reply.take() {
            let _ = reply.send(Err(CommandError::new(
                ErrorCode::Cancelled,
                "Sign-in cancelled",
            )));
        }
    }
}

struct AuthWindowGuard(tauri::WebviewWindow);

impl Drop for AuthWindowGuard {
    fn drop(&mut self) {
        let _ = self.0.close();
    }
}

/// Full auth chain from Microsoft access token → saved MicrosoftAccount.
async fn do_auth_chain(
    ms_access_token: &str,
    refresh_token: String,
    ms_expires_in: u64,
) -> Result<MicrosoftAccount, CommandError> {
    let client = crate::minecraft::mirrors::build_client()?;
    let (xbl_token, uhs) = get_xbl_token(&client, ms_access_token).await?;
    let xsts_token = get_xsts_token(&client, &xbl_token).await?;
    let (mc_token, mc_expires_in) = get_minecraft_token(&client, &uhs, &xsts_token).await?;
    let profile = get_minecraft_profile_from_token(&client, &mc_token).await?;

    let uuid = format_uuid(&profile.id);
    let expires_at = now_secs() + mc_expires_in.min(ms_expires_in);

    Ok(MicrosoftAccount {
        id: uuid::Uuid::new_v4().to_string(),
        uuid,
        username: profile.name,
        access_token: mc_token,
        refresh_token,
        expires_at,
    })
}

// ── Token refresh ─────────────────────────────────────────────────────────────

fn account_token_is_fresh(account: &MicrosoftAccount) -> bool {
    let buffer = 300_u64; // 5 minutes
    account.expires_at > now_secs() + buffer
}

async fn refresh_account(
    account: &MicrosoftAccount,
    force: bool,
) -> Result<MicrosoftAccount, CommandError> {
    // Keep the read/refresh/write sequence serialized. This prevents two
    // simultaneous launches from racing and saving an older rotated token.
    let _guard = accounts_lock().lock().await;
    let mut accounts = read_accounts_unlocked().await?;
    let idx = accounts
        .iter()
        .position(|stored| stored.id == account.id)
        .ok_or_else(|| {
            CommandError::new(ErrorCode::Authentication, "Microsoft account was removed")
        })?;
    let current = accounts[idx].clone();

    // Another request may already have refreshed the account while this one
    // waited for the lock. Reuse its newer token, including for forced refreshes.
    if account_token_is_fresh(&current) && (!force || current.access_token != account.access_token)
    {
        return Ok(current);
    }
    if current.refresh_token.trim().is_empty() {
        return Err(CommandError::new(
            ErrorCode::Authentication,
            "Microsoft account has no refresh token. Sign in again once to repair it.",
        ));
    }

    let client = crate::minecraft::mirrors::build_client()?;
    let ms = refresh_ms_token(&client, &current.refresh_token).await?;
    let new_refresh = ms
        .refresh_token
        .filter(|token| !token.trim().is_empty())
        .unwrap_or_else(|| current.refresh_token.clone());
    let ms_expires = ms.expires_in.unwrap_or(3600);

    let mut updated = do_auth_chain(&ms.access_token, new_refresh, ms_expires).await?;
    if !updated.uuid.eq_ignore_ascii_case(&current.uuid) {
        return Err(CommandError::new(
            ErrorCode::Authentication,
            "Microsoft refresh returned a different Minecraft account; sign in again",
        ));
    }
    updated.id = current.id;
    updated.uuid = current.uuid;

    accounts[idx] = updated.clone();
    write_accounts_unlocked(&accounts).await?;

    Ok(updated)
}

/// If the stored account's Minecraft token is close to expiry, refresh and save.
pub async fn refresh_account_if_expired(
    account: &MicrosoftAccount,
) -> Result<MicrosoftAccount, CommandError> {
    refresh_account(account, false).await
}

async fn refreshed_account_by_id(account_id: &str) -> Result<MicrosoftAccount, CommandError> {
    let accounts = read_accounts().await?;
    let account = accounts
        .into_iter()
        .find(|account| account.id == account_id)
        .ok_or_else(|| {
            CommandError::new(ErrorCode::Authentication, "Microsoft account not found")
        })?;

    refresh_account_if_expired(&account).await
}

async fn force_refreshed_account_by_id(account_id: &str) -> Result<MicrosoftAccount, CommandError> {
    let accounts = read_accounts().await?;
    let account = accounts
        .into_iter()
        .find(|account| account.id == account_id)
        .ok_or_else(|| {
            CommandError::new(ErrorCode::Authentication, "Microsoft account not found")
        })?;

    refresh_account(&account, true).await
}

#[derive(Debug)]
struct MinecraftProfileError {
    status: Option<StatusCode>,
    message: String,
}

impl MinecraftProfileError {
    fn should_retry(&self) -> bool {
        self.status.is_some_and(should_retry_profile_status)
    }

    fn should_reauthenticate(&self) -> bool {
        matches!(
            self.status,
            Some(StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN | StatusCode::NOT_FOUND)
        )
    }

    fn into_message(self) -> CommandError {
        let code = if self.status.is_none() {
            ErrorCode::Network
        } else {
            ErrorCode::Authentication
        };
        CommandError::new(code, self.message)
    }
}

async fn fetch_minecraft_profile(
    client: &Client,
    account: &MicrosoftAccount,
) -> Result<MinecraftProfile, MinecraftProfileError> {
    let resp = client
        .get(MC_PROFILE_URL)
        .bearer_auth(&account.access_token)
        .send()
        .await
        .map_err(|error| MinecraftProfileError {
            status: None,
            message: format!("MC profile request: {error}"),
        })?;

    parse_minecraft_profile_response(resp, "MC profile").await
}

async fn parse_minecraft_profile_response(
    resp: Response,
    context: &str,
) -> Result<MinecraftProfile, MinecraftProfileError> {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(MinecraftProfileError {
            status: Some(status),
            message: format!("{context} error {status}: {body}"),
        });
    }

    serde_json::from_str::<MinecraftProfile>(&body).map_err(|error| MinecraftProfileError {
        status: None,
        message: format!("{context} parse: {error}; body: {body}"),
    })
}

async fn fetch_minecraft_profile_with_retry(
    client: &Client,
    account: &MicrosoftAccount,
) -> Result<MinecraftProfile, MinecraftProfileError> {
    let mut retry_index = 0;
    loop {
        match fetch_minecraft_profile(client, account).await {
            Err(error) if error.should_retry() && retry_index < PROFILE_RETRY_DELAYS_MS.len() => {
                let delay = PROFILE_RETRY_DELAYS_MS[retry_index];
                retry_index += 1;
                sleep(Duration::from_millis(delay)).await;
            }
            result => return result,
        }
    }
}

async fn profile_from_mutation_response(
    client: &Client,
    account: &MicrosoftAccount,
    resp: Response,
    context: &str,
) -> Result<MinecraftProfile, CommandError> {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(CommandError::new(
            ErrorCode::Authentication,
            format!("{context} error {status}: {body}"),
        ));
    }

    if body.trim().is_empty() {
        return fetch_minecraft_profile_with_retry(client, account)
            .await
            .map_err(MinecraftProfileError::into_message);
    }

    serde_json::from_str::<MinecraftProfile>(&body).map_err(|e| {
        let detail = format!("{context} parse: {e}; body: {body}");
        CommandError::from(e).context(detail)
    })
}

fn normalize_skin_variant(variant: &str) -> Result<&'static str, CommandError> {
    match variant.trim().to_ascii_uppercase().as_str() {
        "CLASSIC" | "DEFAULT" => Ok("classic"),
        "SLIM" => Ok("slim"),
        _ => Err(CommandError::new(
            ErrorCode::InvalidInput,
            "Skin variant must be CLASSIC or SLIM",
        )),
    }
}

fn ensure_png_skin_file(file_name: &str, data: &[u8]) -> Result<(), CommandError> {
    if data.is_empty() {
        return Err(CommandError::new(
            ErrorCode::SkinFormat,
            "Skin file is empty",
        ));
    }

    if data.len() > 2 * 1024 * 1024 {
        return Err(CommandError::new(
            ErrorCode::SkinSize,
            "Skin file is too large",
        ));
    }

    if !file_name.to_ascii_lowercase().ends_with(".png") {
        return Err(CommandError::new(
            ErrorCode::SkinFormat,
            "Skin file must be a PNG",
        ));
    }

    const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    if data.len() < PNG_SIGNATURE.len() || &data[..PNG_SIGNATURE.len()] != PNG_SIGNATURE {
        return Err(CommandError::new(
            ErrorCode::SkinFormat,
            "Skin file is not a valid PNG",
        ));
    }

    Ok(())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

fn upsert_account(
    accounts: &mut Vec<MicrosoftAccount>,
    mut account: MicrosoftAccount,
) -> Result<MicrosoftAccount, CommandError> {
    if let Some(index) = accounts
        .iter()
        .position(|stored| stored.uuid.eq_ignore_ascii_case(&account.uuid))
    {
        let stored = &accounts[index];
        account.id = stored.id.clone();
        if account.refresh_token.trim().is_empty() {
            account.refresh_token = stored.refresh_token.clone();
        }
        if account.refresh_token.trim().is_empty() {
            return Err(CommandError::new(
                ErrorCode::Authentication,
                "Microsoft did not provide a refresh token. Sign in again.",
            ));
        }
        accounts[index] = account.clone();
    } else {
        if account.refresh_token.trim().is_empty() {
            return Err(CommandError::new(
                ErrorCode::Authentication,
                "Microsoft did not provide a refresh token. Sign in again.",
            ));
        }
        accounts.push(account.clone());
    }

    Ok(account)
}

#[tauri::command]
pub async fn list_microsoft_accounts() -> Result<Vec<MicrosoftAccountSummary>, CommandError> {
    let result: Result<_, CommandError> = async {
        Ok(read_accounts()
            .await?
            .iter()
            .map(MicrosoftAccountSummary::from)
            .collect())
    }
    .await;
    result
}

#[tauri::command]
pub async fn remove_microsoft_account(id: String) -> Result<(), CommandError> {
    let result: Result<_, CommandError> = async {
        let _guard = accounts_lock().lock().await;
        let mut accounts = read_accounts_unlocked().await?;
        accounts.retain(|a| a.id != id);
        write_accounts_unlocked(&accounts).await
    }
    .await;
    result
}

#[tauri::command]
pub async fn get_minecraft_profile(account_id: String) -> Result<MinecraftProfile, CommandError> {
    let result: Result<_, CommandError> = async {
        let mut account = refreshed_account_by_id(&account_id).await?;
        let client = crate::minecraft::mirrors::build_client()?;
        match fetch_minecraft_profile_with_retry(&client, &account).await {
            Ok(profile) => Ok(profile),
            Err(error) if error.should_reauthenticate() => {
                account = force_refreshed_account_by_id(&account_id).await?;
                fetch_minecraft_profile_with_retry(&client, &account)
                    .await
                    .map_err(MinecraftProfileError::into_message)
            }
            Err(error) => Err(error.into_message()),
        }
    }
    .await;
    result
}

#[tauri::command]
pub async fn upload_minecraft_skin(
    account_id: String,
    variant: String,
    file_name: String,
    data: Vec<u8>,
) -> Result<MinecraftProfile, CommandError> {
    let result: Result<_, CommandError> = async {
        ensure_png_skin_file(&file_name, &data)?;

        let account = refreshed_account_by_id(&account_id).await?;
        let client = crate::minecraft::mirrors::build_client()?;
        let normalized_variant = normalize_skin_variant(&variant)?;
        let part = multipart::Part::bytes(data)
            .file_name(file_name)
            .mime_str("image/png")
            .map_err(|e| {
                let detail = format!("Skin mime error: {e}");
                CommandError::from(e).context(detail)
            })?;
        let form = multipart::Form::new()
            .text("variant", normalized_variant.to_string())
            .part("file", part);

        let resp = client
            .post(format!("{MC_PROFILE_URL}/skins"))
            .bearer_auth(&account.access_token)
            .multipart(form)
            .send()
            .await
            .map_err(|e| {
                let detail = format!("Upload skin request: {e}");
                CommandError::from(e).context(detail)
            })?;

        profile_from_mutation_response(&client, &account, resp, "Upload skin").await
    }
    .await;
    result
}

#[tauri::command]
pub async fn reset_minecraft_skin(account_id: String) -> Result<MinecraftProfile, CommandError> {
    let result: Result<_, CommandError> = async {
        let account = refreshed_account_by_id(&account_id).await?;
        let client = crate::minecraft::mirrors::build_client()?;
        let resp = client
            .delete(format!("{MC_PROFILE_URL}/skins/active"))
            .bearer_auth(&account.access_token)
            .send()
            .await
            .map_err(|e| {
                let detail = format!("Reset skin request: {e}");
                CommandError::from(e).context(detail)
            })?;

        profile_from_mutation_response(&client, &account, resp, "Reset skin").await
    }
    .await;
    result
}

#[tauri::command]
pub async fn set_minecraft_cape(
    account_id: String,
    cape_id: String,
) -> Result<MinecraftProfile, CommandError> {
    let result: Result<_, CommandError> = async {
        let account = refreshed_account_by_id(&account_id).await?;
        let client = crate::minecraft::mirrors::build_client()?;
        let resp = client
            .put(format!("{MC_PROFILE_URL}/capes/active"))
            .bearer_auth(&account.access_token)
            .json(&CapeSelectionRequest { cape_id })
            .send()
            .await
            .map_err(|e| {
                let detail = format!("Set cape request: {e}");
                CommandError::from(e).context(detail)
            })?;

        profile_from_mutation_response(&client, &account, resp, "Set cape").await
    }
    .await;
    result
}

#[tauri::command]
pub async fn hide_minecraft_cape(account_id: String) -> Result<MinecraftProfile, CommandError> {
    let result: Result<_, CommandError> = async {
        let account = refreshed_account_by_id(&account_id).await?;
        let client = crate::minecraft::mirrors::build_client()?;
        let resp = client
            .delete(format!("{MC_PROFILE_URL}/capes/active"))
            .bearer_auth(&account.access_token)
            .send()
            .await
            .map_err(|e| {
                let detail = format!("Hide cape request: {e}");
                CommandError::from(e).context(detail)
            })?;

        profile_from_mutation_response(&client, &account, resp, "Hide cape").await
    }
    .await;
    result
}

#[tauri::command]
pub async fn start_microsoft_auth(app: AppHandle) -> Result<MicrosoftAccountSummary, CommandError> {
    let result: Result<_, CommandError> = async {
        let _operation = crate::operations::begin("authentication", None)?;
        // If the auth window is already open, focus it and return an error
        if let Some(existing) = app.get_webview_window("ms-login") {
            let _ = existing.set_focus();
            return Err(CommandError::new(
                ErrorCode::Authentication,
                "Auth window already open — complete sign-in in the open window",
            ));
        }

        let (tx, rx) = oneshot::channel::<Result<String, CommandError>>();
        let callback = MicrosoftAuthCallback::new(tx);
        let auth_url = build_auth_url(&callback.state);
        let shared = Arc::new(Mutex::new(callback));
        let shared_close = shared.clone();

        let window = WebviewWindowBuilder::new(
            &app,
            "ms-login",
            WebviewUrl::External(auth_url.parse().map_err(|e| {
                let detail = format!("URL parse: {e}");
                CommandError::from(e).context(detail)
            })?),
        )
        .title("Sign in with Microsoft")
        .inner_size(480.0, 680.0)
        .center()
        .resizable(false)
        .always_on_top(true)
        .on_navigation(move |url| {
            shared
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .on_navigation(url)
        })
        .build()
        .map_err(|e| {
            let detail = format!("Failed to open auth window: {e}");
            CommandError::from(e).context(detail)
        })?;

        // Destroying the window consumes only this attempt's reply.
        window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                shared_close
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .cancel();
            }
        });
        let _ = window.set_focus();
        let window_guard = AuthWindowGuard(window);
        let code = tokio::time::timeout(Duration::from_secs(10 * 60), rx)
            .await
            .map_err(|_| {
                CommandError::new(
                    ErrorCode::Network,
                    "Microsoft sign-in timed out; start sign-in again",
                )
            })?
            .map_err(|_| {
                CommandError::new(ErrorCode::Authentication, "Auth window closed unexpectedly")
            })??;
        // Use the original window handle so cleanup cannot close a new attempt
        // that happens to reuse the ms-login label. Errors also close via Drop.
        drop(window_guard);

        // Exchange code for MS tokens
        let client = crate::minecraft::mirrors::build_client()?;
        let ms_tokens = exchange_code(&client, &code).await?;
        let refresh_token = ms_tokens.refresh_token.unwrap_or_default();
        let ms_expires = ms_tokens.expires_in.unwrap_or(3600);

        // Complete auth chain
        let account = do_auth_chain(&ms_tokens.access_token, refresh_token, ms_expires).await?;

        // Preserve the launcher-side ID so selections and plugin references stay valid.
        let _guard = accounts_lock().lock().await;
        let mut accounts = read_accounts_unlocked().await?;
        let account = upsert_account(&mut accounts, account)?;
        write_accounts_unlocked(&accounts).await?;

        Ok(MicrosoftAccountSummary::from(&account))
    }
    .await;
    result
}

#[cfg(test)]
mod tests {
    use super::{
        atomic_write, sidecar_path, upsert_account, MicrosoftAccount, MinecraftProfileError,
        StoredMicrosoftAccount,
    };
    use reqwest::StatusCode;
    use std::path::Path;

    fn account(id: &str, uuid: &str, refresh_token: &str) -> MicrosoftAccount {
        MicrosoftAccount {
            id: id.to_string(),
            uuid: uuid.to_string(),
            username: format!("player-{id}"),
            access_token: format!("access-{id}"),
            refresh_token: refresh_token.to_string(),
            expires_at: 100,
        }
    }

    #[test]
    fn repeated_sign_in_preserves_id_and_existing_refresh_token() {
        let mut accounts = vec![account("stable-id", "same-uuid", "saved-refresh")];
        let replacement = account("new-id", "SAME-UUID", "");

        let saved = upsert_account(&mut accounts, replacement).unwrap();

        assert_eq!(accounts.len(), 1);
        assert_eq!(saved.id, "stable-id");
        assert_eq!(saved.refresh_token, "saved-refresh");
        assert_eq!(accounts[0].id, "stable-id");
    }

    #[test]
    fn new_account_requires_a_refresh_token() {
        let mut accounts = Vec::new();
        let error = upsert_account(&mut accounts, account("new-id", "new-uuid", ""))
            .unwrap_err()
            .detail;

        assert!(error.contains("refresh token"));
        assert!(accounts.is_empty());
    }

    #[test]
    fn repeated_sign_in_cannot_save_two_empty_refresh_tokens() {
        let original = account("stable-id", "same-uuid", "");
        let mut accounts = vec![original.clone()];

        let error = upsert_account(&mut accounts, account("new-id", "same-uuid", ""))
            .unwrap_err()
            .detail;

        assert!(error.contains("refresh token"));
        assert_eq!(accounts[0].id, original.id);
        assert!(accounts[0].refresh_token.is_empty());
    }

    #[test]
    fn profile_404_is_retried_and_can_trigger_reauthentication() {
        let error = MinecraftProfileError {
            status: Some(StatusCode::NOT_FOUND),
            message: String::new(),
        };

        assert!(error.should_retry());
        assert!(error.should_reauthenticate());
    }

    #[test]
    fn storage_sidecars_keep_the_full_file_name() {
        assert_eq!(
            sidecar_path(Path::new("accounts.json"), ".bak"),
            Path::new("accounts.json.bak")
        );
    }

    #[test]
    fn account_metadata_never_serializes_legacy_tokens() {
        let metadata = StoredMicrosoftAccount {
            id: uuid::Uuid::new_v4().to_string(),
            uuid: "minecraft-uuid".to_string(),
            username: "player".to_string(),
            expires_at: 100,
            access_token: "plaintext-access-token".to_string(),
            refresh_token: "plaintext-refresh-token".to_string(),
        };

        let json = serde_json::to_string(&metadata).unwrap();

        assert!(!json.contains("accessToken"));
        assert!(!json.contains("refreshToken"));
        assert!(!json.contains("plaintext"));
    }

    #[tokio::test]
    async fn atomic_storage_replaces_an_existing_file() {
        let directory = std::env::temp_dir().join(format!("screen-auth-{}", uuid::Uuid::new_v4()));
        let path = directory.join("accounts.json");

        atomic_write(&path, b"old").await.unwrap();
        atomic_write(&path, b"new").await.unwrap();

        assert_eq!(tokio::fs::read(&path).await.unwrap(), b"new");
        assert!(!sidecar_path(&path, ".tmp").exists());
        tokio::fs::remove_dir_all(directory).await.unwrap();
    }
}

#[cfg(test)]
mod oauth_callback_tests {
    use super::*;

    fn callback_url(query: &str) -> url::Url {
        url::Url::parse(&format!("{MS_REDIRECT_URI}?{query}")).unwrap()
    }

    #[test]
    fn each_attempt_has_its_own_unpredictable_state_in_the_authorization_url() {
        let (first_tx, _) = oneshot::channel();
        let (second_tx, _) = oneshot::channel();
        let first = MicrosoftAuthCallback::new(first_tx);
        let second = MicrosoftAuthCallback::new(second_tx);
        assert_ne!(first.state, second.state);
        assert_eq!(first.state.len(), 64);
        assert!(first.state.bytes().all(|b| b.is_ascii_hexdigit()));
        let url = url::Url::parse(&build_auth_url(&first.state)).unwrap();
        let params = url
            .query_pairs()
            .collect::<std::collections::HashMap<_, _>>();
        assert_eq!(
            params.get("state").map(|v| v.as_ref()),
            Some(first.state.as_str())
        );
        assert_eq!(
            params.get("redirect_uri").map(|v| v.as_ref()),
            Some(MS_REDIRECT_URI)
        );
        assert_eq!(
            params.get("response_type").map(|v| v.as_ref()),
            Some("code")
        );
        // Preserve the Live/Xbox flow while PKCE compatibility is assessed.
        assert_eq!(params.get("scope").map(|v| v.as_ref()), Some(MS_SCOPE));
        assert_eq!(
            params.get("client_id").map(|v| v.as_ref()),
            Some(MS_CLIENT_ID)
        );
    }

    #[test]
    fn accepts_only_the_exact_redirect_origin_and_path() {
        assert!(is_microsoft_callback(&callback_url(
            "state=expected&code=valid"
        )));
        for address in [
            "http://login.live.com/oauth20_desktop.srf",
            "https://login.live.com:444/oauth20_desktop.srf",
            "https://login.live.com.evil.example/oauth20_desktop.srf",
            "https://login.live.com@evil.example/oauth20_desktop.srf",
            "https://user@login.live.com/oauth20_desktop.srf",
            "https://user:password@login.live.com/oauth20_desktop.srf",
            "https://login.live.com/oauth20_desktop.srf.evil",
            "https://login.live.com/oauth20_desktop.srf/extra",
            "https://login.live.com/oauth20_desktop.srf/",
            "https://login.live.com/OAUTH20_desktop.srf",
            "https://login.live.com/oauth20_desktop%2esrf",
        ] {
            let url = url::Url::parse(address).unwrap();
            assert!(!is_microsoft_callback(&url), "{address}");
            assert!(microsoft_callback_code(&url, "expected").is_err());
        }
    }

    #[test]
    fn requires_exactly_one_matching_state_and_an_unambiguous_nonempty_result() {
        assert_eq!(
            microsoft_callback_code(&callback_url("state=expected&code=valid"), "expected")
                .unwrap(),
            "valid"
        );
        for query in [
            "code=secret-code",
            "state=&code=secret-code",
            "state=other&code=secret-code",
            "state=expected&state=other&code=secret-code",
            "state=expected&%73tate=expected&code=secret-code",
            "state=expected&code=one&code=two",
            "state=expected&code=one&error=access_denied",
            "state=expected&error=access_denied&error=server_error",
            "state=expected&code=",
            "state=expected&code=+++",
            "state=expected",
            "state=expected&code=secret-code#extra",
        ] {
            let error = microsoft_callback_code(&callback_url(query), "expected")
                .unwrap_err()
                .detail;
            assert!(!error.contains("secret-code"));
            assert!(!error.contains("expected"));
        }
        assert!(microsoft_callback_code(&callback_url("state=&code=valid"), "").is_err());
    }

    #[test]
    fn validates_state_for_provider_errors_as_well_as_successful_responses() {
        assert!(microsoft_callback_code(
            &callback_url("state=other&error=access_denied"),
            "expected"
        )
        .unwrap_err()
        .detail
        .contains("state mismatch"));
        assert_eq!(
            microsoft_callback_code(
                &callback_url("state=expected&error=access_denied"),
                "expected"
            )
            .unwrap_err()
            .detail,
            "Sign-in cancelled"
        );
        assert_eq!(
            microsoft_callback_code(
                &callback_url("state=expected&error=server_error&error_description=private"),
                "expected"
            )
            .unwrap_err()
            .detail,
            "Microsoft rejected the sign-in request"
        );
    }

    #[test]
    fn unrelated_navigation_does_not_consume_the_reply_and_success_is_single_use() {
        let (tx, mut rx) = oneshot::channel();
        let mut callback = MicrosoftAuthCallback::new(tx);
        let unrelated =
            url::Url::parse("https://login.live.com/oauth20_desktop.srf.evil?code=untrusted")
                .unwrap();
        assert!(callback.on_navigation(&unrelated));
        assert!(matches!(
            rx.try_recv(),
            Err(oneshot::error::TryRecvError::Empty)
        ));
        let valid = callback_url(&format!("state={}&code=valid", callback.state));
        assert!(!callback.on_navigation(&valid));
        assert_eq!(rx.try_recv().unwrap().unwrap(), "valid");
        assert!(!callback.on_navigation(&valid));
        callback.cancel();
        assert!(callback.reply.is_none());
    }

    #[test]
    fn oauth_error_parameters_assign_codes_without_parsing_display_text() {
        for (reason, expected) in [
            ("access_denied", ErrorCode::Cancelled),
            ("server_error", ErrorCode::Authentication),
        ] {
            let error = microsoft_callback_code(
                &callback_url(&format!("state=expected&error={reason}")),
                "expected",
            )
            .unwrap_err();
            assert_eq!(error.code, expected);
        }
    }

    #[test]
    fn callbacks_from_an_old_attempt_and_cancelled_attempts_cannot_sign_in() {
        let (old_tx, _) = oneshot::channel();
        let previous = MicrosoftAuthCallback::new(old_tx);
        let (tx, mut rx) = oneshot::channel();
        let mut current = MicrosoftAuthCallback::new(tx);
        assert!(!current.on_navigation(&callback_url(&format!(
            "state={}&code=old-code",
            previous.state
        ))));
        assert!(rx
            .try_recv()
            .unwrap()
            .unwrap_err()
            .detail
            .contains("state mismatch"));
        assert!(current.reply.is_none());
        let (tx, mut rx) = oneshot::channel();
        let mut cancelled = MicrosoftAuthCallback::new(tx);
        cancelled.cancel();
        let valid = callback_url(&format!("state={}&code=valid", cancelled.state));
        assert!(!cancelled.on_navigation(&valid));
        assert_eq!(
            rx.try_recv().unwrap().unwrap_err().detail,
            "Sign-in cancelled"
        );
        assert!(cancelled.reply.is_none());
    }
}
