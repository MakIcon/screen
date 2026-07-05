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

    fn into_message(self) -> String {
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
        }
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

async fn read_account_file(path: &Path) -> Result<Option<Vec<StoredMicrosoftAccount>>, String> {
    let raw = match tokio::fs::read_to_string(path).await {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("read {}: {error}", path.display())),
    };

    serde_json::from_str(&raw)
        .map(Some)
        .map_err(|error| format!("parse {}: {error}", path.display()))
}

async fn read_account_metadata_unlocked() -> Result<Vec<StoredMicrosoftAccount>, String> {
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
            format!("; recovery failed: {}", recovery_errors.join("; "))
        };
        return Err(format!("{primary_error}{recovery_details}"));
    }

    Ok(Vec::new())
}

fn account_secret_path(account_id: &str) -> Result<PathBuf, String> {
    uuid::Uuid::parse_str(account_id)
        .map_err(|_| "Invalid Microsoft account ID in secure storage".to_string())?;
    Ok(account_secrets_root()?.join(format!("{account_id}.bin")))
}

fn decrypt_account_secrets(encrypted: &[u8]) -> Result<AccountSecrets, String> {
    let plaintext = secure_storage::unprotect(encrypted)?;
    serde_json::from_slice(&plaintext).map_err(|error| format!("parse account secret: {error}"))
}

async fn read_account_secret(account_id: &str) -> Result<Option<AccountSecrets>, String> {
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
        Err(format!(
            "Unable to unlock Microsoft account: {}",
            errors.join("; ")
        ))
    }
}

async fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("create account directory: {error}"))?;
    }

    let temporary_path = sidecar_path(path, ".tmp");
    let result = async {
        tokio::fs::write(&temporary_path, data)
            .await
            .map_err(|error| format!("write {}: {error}", temporary_path.display()))?;
        let temporary_file = tokio::fs::OpenOptions::new()
            .write(true)
            .open(&temporary_path)
            .await
            .map_err(|error| format!("open {}: {error}", temporary_path.display()))?;
        temporary_file
            .sync_all()
            .await
            .map_err(|error| format!("sync {}: {error}", temporary_path.display()))?;
        drop(temporary_file);
        tokio::fs::rename(&temporary_path, path)
            .await
            .map_err(|error| format!("replace {}: {error}", path.display()))
    }
    .await;

    if result.is_err() {
        let _ = tokio::fs::remove_file(&temporary_path).await;
    }
    result
}

async fn write_account_secret(account: &MicrosoftAccount) -> Result<(), String> {
    let path = account_secret_path(&account.id)?;
    let plaintext = serde_json::to_vec(&AccountSecrets {
        access_token: account.access_token.clone(),
        refresh_token: account.refresh_token.clone(),
    })
    .map_err(|error| format!("serialize account secret: {error}"))?;
    let encrypted = secure_storage::protect(&plaintext)?;

    // Keep the previous valid encrypted token as a recovery copy.
    if let Ok(previous) = tokio::fs::read(&path).await {
        if decrypt_account_secrets(&previous).is_ok() {
            atomic_write(&sidecar_path(&path, ".bak"), &previous).await?;
        }
    }

    atomic_write(&path, &encrypted).await
}

async fn cleanup_removed_account_secrets(active_ids: &[String]) -> Result<(), String> {
    let root = account_secrets_root()?;
    let mut entries = match tokio::fs::read_dir(&root).await {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("read account secrets directory: {error}")),
    };

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|error| format!("read account secret entry: {error}"))?
    {
        let file_name = entry.file_name().to_string_lossy().into_owned();
        let Some((account_id, _)) = file_name.split_once(".bin") else {
            continue;
        };
        if !active_ids.iter().any(|id| id == account_id) {
            tokio::fs::remove_file(entry.path())
                .await
                .map_err(|error| format!("remove stale account secret: {error}"))?;
        }
    }
    Ok(())
}

async fn write_accounts_unlocked(accounts: &[MicrosoftAccount]) -> Result<(), String> {
    let path = accounts_path()?;
    for account in accounts {
        write_account_secret(account).await?;
    }

    let metadata: Vec<_> = accounts.iter().map(StoredMicrosoftAccount::from).collect();
    let raw =
        serde_json::to_vec_pretty(&metadata).map_err(|e| format!("serialize accounts: {e}"))?;

    // Never let a malformed primary file overwrite a usable recovery copy.
    if let Ok(Some(previous_accounts)) = read_account_file(&path).await {
        let backup = serde_json::to_vec_pretty(&previous_accounts)
            .map_err(|error| format!("serialize accounts backup: {error}"))?;
        atomic_write(&sidecar_path(&path, ".bak"), &backup).await?;
    }

    atomic_write(&path, &raw).await?;
    // Also sanitize a legacy recovery file that may have been used because the
    // primary metadata was damaged. No plaintext token copy is left behind.
    atomic_write(&sidecar_path(&path, ".bak"), &raw).await?;
    let active_ids: Vec<_> = accounts.iter().map(|account| account.id.clone()).collect();
    cleanup_removed_account_secrets(&active_ids).await
}

async fn read_accounts_unlocked() -> Result<Vec<MicrosoftAccount>, String> {
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
                    format!(
                        "Secure tokens are missing for Microsoft account {}. Sign in again.",
                        stored.username
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

pub async fn read_accounts() -> Result<Vec<MicrosoftAccount>, String> {
    let _guard = accounts_lock().lock().await;
    read_accounts_unlocked().await
}

pub async fn write_accounts(accounts: &[MicrosoftAccount]) -> Result<(), String> {
    let _guard = accounts_lock().lock().await;
    write_accounts_unlocked(accounts).await
}

// ── Auth steps ────────────────────────────────────────────────────────────────

async fn post_form(
    client: &Client,
    url: &str,
    pairs: &[(&str, &str)],
) -> Result<reqwest::Response, String> {
    let body = encode_form(pairs);
    client
        .post(url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("POST {url}: {e}"))
}

async fn exchange_code(client: &Client, code: &str) -> Result<MsTokenResponse, String> {
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
        return Err(format!("MS token error {status}: {body}"));
    }
    resp.json::<MsTokenResponse>()
        .await
        .map_err(|e| format!("MS token parse: {e}"))
}

async fn refresh_ms_token(client: &Client, refresh_token: &str) -> Result<MsTokenResponse, String> {
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
        return Err(format!("MS refresh error {status}: {body}"));
    }
    resp.json::<MsTokenResponse>()
        .await
        .map_err(|e| format!("MS refresh parse: {e}"))
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

async fn get_xbl_token(client: &Client, ms_access_token: &str) -> Result<(String, String), String> {
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
        .unwrap_or_else(|| "XBL error: token exchange failed".to_string()))
}

async fn get_xsts_token(client: &Client, xbl_token: &str) -> Result<String, String> {
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
        .map_err(|e| format!("XSTS request: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        // Give a helpful message for common XSTS errors
        if body.contains("2148916238") {
            return Err("Microsoft account is not available in your region".into());
        }
        if body.contains("2148916233") {
            return Err("This Microsoft account doesn't have an Xbox account. Please create one at xbox.com".into());
        }
        if body.contains("2148916235") {
            return Err("Child accounts are not supported".into());
        }
        return Err(format!("XSTS error {status}: {body}"));
    }
    let data = resp
        .json::<XstsResponse>()
        .await
        .map_err(|e| format!("XSTS parse: {e}"))?;
    Ok(data.token)
}

async fn get_minecraft_token(
    client: &Client,
    uhs: &str,
    xsts_token: &str,
) -> Result<(String, u64), String> {
    let req = McLoginRequest {
        identity_token: format!("XBL3.0 x={uhs};{xsts_token}"),
    };
    let resp = client
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&req)
        .send()
        .await
        .map_err(|e| format!("MC auth request: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("MC auth error {status}: {body}"));
    }
    let data = resp
        .json::<McLoginResponse>()
        .await
        .map_err(|e| format!("MC auth parse: {e}"))?;
    Ok((data.access_token, data.expires_in.unwrap_or(86400)))
}

async fn get_minecraft_profile_from_token(
    client: &Client,
    mc_token: &str,
) -> Result<McProfileResponse, String> {
    let mut retry_index = 0;
    loop {
        let resp = client
            .get(MC_PROFILE_URL)
            .header("Authorization", format!("Bearer {mc_token}"))
            .send()
            .await
            .map_err(|e| format!("MC profile request: {e}"))?;
        let status = resp.status();
        if status.is_success() {
            return resp
                .json::<McProfileResponse>()
                .await
                .map_err(|e| format!("MC profile parse: {e}"));
        }

        let body = resp.text().await.unwrap_or_default();
        if should_retry_profile_status(status) && retry_index < PROFILE_RETRY_DELAYS_MS.len() {
            let delay = PROFILE_RETRY_DELAYS_MS[retry_index];
            retry_index += 1;
            sleep(Duration::from_millis(delay)).await;
            continue;
        }
        return Err(format!("MC profile error {status}: {body}"));
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

fn build_auth_url() -> String {
    let query = encode_form(&[
        ("client_id", MS_CLIENT_ID),
        ("response_type", "code"),
        ("scope", MS_SCOPE),
        ("redirect_uri", MS_REDIRECT_URI),
        ("prompt", "select_account"),
    ]);
    format!("{MS_AUTH_URL}?{query}")
}

/// Full auth chain from Microsoft access token → saved MicrosoftAccount.
async fn do_auth_chain(
    ms_access_token: &str,
    refresh_token: String,
    ms_expires_in: u64,
) -> Result<MicrosoftAccount, String> {
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
) -> Result<MicrosoftAccount, String> {
    // Keep the read/refresh/write sequence serialized. This prevents two
    // simultaneous launches from racing and saving an older rotated token.
    let _guard = accounts_lock().lock().await;
    let mut accounts = read_accounts_unlocked().await?;
    let idx = accounts
        .iter()
        .position(|stored| stored.id == account.id)
        .ok_or_else(|| "Microsoft account was removed".to_string())?;
    let current = accounts[idx].clone();

    // Another request may already have refreshed the account while this one
    // waited for the lock. Reuse its newer token, including for forced refreshes.
    if account_token_is_fresh(&current) && (!force || current.access_token != account.access_token)
    {
        return Ok(current);
    }
    if current.refresh_token.trim().is_empty() {
        return Err(
            "Microsoft account has no refresh token. Sign in again once to repair it.".to_string(),
        );
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
        return Err(
            "Microsoft refresh returned a different Minecraft account; sign in again".to_string(),
        );
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
) -> Result<MicrosoftAccount, String> {
    refresh_account(account, false).await
}

async fn refreshed_account_by_id(account_id: &str) -> Result<MicrosoftAccount, String> {
    let accounts = read_accounts().await?;
    let account = accounts
        .into_iter()
        .find(|account| account.id == account_id)
        .ok_or_else(|| "Microsoft account not found".to_string())?;

    refresh_account_if_expired(&account).await
}

async fn force_refreshed_account_by_id(account_id: &str) -> Result<MicrosoftAccount, String> {
    let accounts = read_accounts().await?;
    let account = accounts
        .into_iter()
        .find(|account| account.id == account_id)
        .ok_or_else(|| "Microsoft account not found".to_string())?;

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

    fn into_message(self) -> String {
        self.message
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
) -> Result<MinecraftProfile, String> {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("{context} error {status}: {body}"));
    }

    if body.trim().is_empty() {
        return fetch_minecraft_profile_with_retry(client, account)
            .await
            .map_err(MinecraftProfileError::into_message);
    }

    serde_json::from_str::<MinecraftProfile>(&body)
        .map_err(|e| format!("{context} parse: {e}; body: {body}"))
}

fn normalize_skin_variant(variant: &str) -> Result<&'static str, String> {
    match variant.trim().to_ascii_uppercase().as_str() {
        "CLASSIC" | "DEFAULT" => Ok("classic"),
        "SLIM" => Ok("slim"),
        _ => Err("Skin variant must be CLASSIC or SLIM".to_string()),
    }
}

fn ensure_png_skin_file(file_name: &str, data: &[u8]) -> Result<(), String> {
    if data.is_empty() {
        return Err("Skin file is empty".to_string());
    }

    if data.len() > 2 * 1024 * 1024 {
        return Err("Skin file is too large".to_string());
    }

    if !file_name.to_ascii_lowercase().ends_with(".png") {
        return Err("Skin file must be a PNG".to_string());
    }

    const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    if data.len() < PNG_SIGNATURE.len() || &data[..PNG_SIGNATURE.len()] != PNG_SIGNATURE {
        return Err("Skin file is not a valid PNG".to_string());
    }

    Ok(())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

fn upsert_account(
    accounts: &mut Vec<MicrosoftAccount>,
    mut account: MicrosoftAccount,
) -> Result<MicrosoftAccount, String> {
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
            return Err("Microsoft did not provide a refresh token. Sign in again.".to_string());
        }
        accounts[index] = account.clone();
    } else {
        if account.refresh_token.trim().is_empty() {
            return Err("Microsoft did not provide a refresh token. Sign in again.".to_string());
        }
        accounts.push(account.clone());
    }

    Ok(account)
}

#[tauri::command]
pub async fn list_microsoft_accounts() -> Result<Vec<MicrosoftAccountSummary>, String> {
    Ok(read_accounts()
        .await?
        .iter()
        .map(MicrosoftAccountSummary::from)
        .collect())
}

#[tauri::command]
pub async fn remove_microsoft_account(id: String) -> Result<(), String> {
    let _guard = accounts_lock().lock().await;
    let mut accounts = read_accounts_unlocked().await?;
    accounts.retain(|a| a.id != id);
    write_accounts_unlocked(&accounts).await
}

#[tauri::command]
pub async fn get_minecraft_profile(account_id: String) -> Result<MinecraftProfile, String> {
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

#[tauri::command]
pub async fn upload_minecraft_skin(
    account_id: String,
    variant: String,
    file_name: String,
    data: Vec<u8>,
) -> Result<MinecraftProfile, String> {
    ensure_png_skin_file(&file_name, &data)?;

    let account = refreshed_account_by_id(&account_id).await?;
    let client = crate::minecraft::mirrors::build_client()?;
    let normalized_variant = normalize_skin_variant(&variant)?;
    let part = multipart::Part::bytes(data)
        .file_name(file_name)
        .mime_str("image/png")
        .map_err(|e| format!("Skin mime error: {e}"))?;
    let form = multipart::Form::new()
        .text("variant", normalized_variant.to_string())
        .part("file", part);

    let resp = client
        .post(format!("{MC_PROFILE_URL}/skins"))
        .bearer_auth(&account.access_token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Upload skin request: {e}"))?;

    profile_from_mutation_response(&client, &account, resp, "Upload skin").await
}

#[tauri::command]
pub async fn reset_minecraft_skin(account_id: String) -> Result<MinecraftProfile, String> {
    let account = refreshed_account_by_id(&account_id).await?;
    let client = crate::minecraft::mirrors::build_client()?;
    let resp = client
        .delete(format!("{MC_PROFILE_URL}/skins/active"))
        .bearer_auth(&account.access_token)
        .send()
        .await
        .map_err(|e| format!("Reset skin request: {e}"))?;

    profile_from_mutation_response(&client, &account, resp, "Reset skin").await
}

#[tauri::command]
pub async fn set_minecraft_cape(
    account_id: String,
    cape_id: String,
) -> Result<MinecraftProfile, String> {
    let account = refreshed_account_by_id(&account_id).await?;
    let client = crate::minecraft::mirrors::build_client()?;
    let resp = client
        .put(format!("{MC_PROFILE_URL}/capes/active"))
        .bearer_auth(&account.access_token)
        .json(&CapeSelectionRequest { cape_id })
        .send()
        .await
        .map_err(|e| format!("Set cape request: {e}"))?;

    profile_from_mutation_response(&client, &account, resp, "Set cape").await
}

#[tauri::command]
pub async fn hide_minecraft_cape(account_id: String) -> Result<MinecraftProfile, String> {
    let account = refreshed_account_by_id(&account_id).await?;
    let client = crate::minecraft::mirrors::build_client()?;
    let resp = client
        .delete(format!("{MC_PROFILE_URL}/capes/active"))
        .bearer_auth(&account.access_token)
        .send()
        .await
        .map_err(|e| format!("Hide cape request: {e}"))?;

    profile_from_mutation_response(&client, &account, resp, "Hide cape").await
}

#[tauri::command]
pub async fn start_microsoft_auth(app: AppHandle) -> Result<MicrosoftAccountSummary, String> {
    // If the auth window is already open, focus it and return an error
    if let Some(existing) = app.get_webview_window("ms-login") {
        let _ = existing.set_focus();
        return Err("Auth window already open — complete sign-in in the open window".into());
    }

    let auth_url = build_auth_url();

    let (tx, rx) = oneshot::channel::<Result<String, String>>();
    let shared = Arc::new(Mutex::new(Some(tx)));
    let shared_close = shared.clone();

    let window = WebviewWindowBuilder::new(
        &app,
        "ms-login",
        WebviewUrl::External(auth_url.parse().map_err(|e| format!("URL parse: {e}"))?),
    )
    .title("Sign in with Microsoft")
    .inner_size(480.0, 680.0)
    .center()
    .resizable(false)
    .always_on_top(true)
    .on_navigation(move |url| {
        if url.as_str().starts_with(MS_REDIRECT_URI) {
            let code = url
                .query_pairs()
                .find(|(k, _)| k == "code")
                .map(|(_, v)| v.into_owned());
            if let Ok(mut guard) = shared.lock() {
                if let Some(tx) = guard.take() {
                    match code {
                        Some(c) => {
                            let _ = tx.send(Ok(c));
                        }
                        None => {
                            let _ = tx.send(Err("No auth code in redirect URL".into()));
                        }
                    }
                }
            }
            return false; // block navigation to the desktop redirect page
        }
        true
    })
    .build()
    .map_err(|e| format!("Failed to open auth window: {e}"))?;

    // Detect user closing window (cancel)
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            if let Ok(mut guard) = shared_close.lock() {
                if let Some(tx) = guard.take() {
                    let _ = tx.send(Err("Sign-in cancelled".into()));
                }
            }
        }
    });

    let _ = window.set_focus();

    // Wait for code (blocks until user logs in or closes the window)
    let code = rx
        .await
        .map_err(|_| "Auth window closed unexpectedly".to_string())??;

    // Close the window
    if let Some(win) = app.get_webview_window("ms-login") {
        let _ = win.close();
    }

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
        let error = upsert_account(&mut accounts, account("new-id", "new-uuid", "")).unwrap_err();

        assert!(error.contains("refresh token"));
        assert!(accounts.is_empty());
    }

    #[test]
    fn repeated_sign_in_cannot_save_two_empty_refresh_tokens() {
        let original = account("stable-id", "same-uuid", "");
        let mut accounts = vec![original.clone()];

        let error = upsert_account(&mut accounts, account("new-id", "same-uuid", "")).unwrap_err();

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
