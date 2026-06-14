use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::{multipart, Client, Response, StatusCode};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

use url::form_urlencoded;

use crate::{
    models::{MicrosoftAccount, MinecraftProfile},
    paths::accounts_path,
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

pub async fn read_accounts() -> Result<Vec<MicrosoftAccount>, String> {
    let path = accounts_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("read accounts: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse accounts: {e}"))
}

pub async fn write_accounts(accounts: &[MicrosoftAccount]) -> Result<(), String> {
    let path = accounts_path()?;
    let raw =
        serde_json::to_string_pretty(accounts).map_err(|e| format!("serialize accounts: {e}"))?;
    tokio::fs::write(path, raw)
        .await
        .map_err(|e| format!("write accounts: {e}"))
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
    let resp = client
        .get("https://api.minecraftservices.com/minecraft/profile")
        .header("Authorization", format!("Bearer {mc_token}"))
        .send()
        .await
        .map_err(|e| format!("MC profile request: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("MC profile error {status}: {body}"));
    }
    resp.json::<McProfileResponse>()
        .await
        .map_err(|e| format!("MC profile parse: {e}"))
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
    let client = Client::new();
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

/// If the stored account's Minecraft token is close to expiry, refresh and save.
pub async fn refresh_account_if_expired(
    account: &MicrosoftAccount,
) -> Result<MicrosoftAccount, String> {
    let buffer = 300_u64; // 5 minutes
    if account.expires_at > now_secs() + buffer {
        return Ok(account.clone());
    }

    let client = Client::new();
    let ms = refresh_ms_token(&client, &account.refresh_token).await?;
    let new_refresh = ms
        .refresh_token
        .unwrap_or_else(|| account.refresh_token.clone());
    let ms_expires = ms.expires_in.unwrap_or(3600);

    let mut updated = do_auth_chain(&ms.access_token, new_refresh, ms_expires).await?;
    // Keep the same launcher-side ID and UUID
    updated.id = account.id.clone();
    updated.uuid = account.uuid.clone();

    // Persist
    let mut accounts = read_accounts().await?;
    if let Some(idx) = accounts.iter().position(|a| a.id == account.id) {
        accounts[idx] = updated.clone();
    }
    write_accounts(&accounts).await?;

    Ok(updated)
}

async fn refreshed_account_by_id(account_id: &str) -> Result<MicrosoftAccount, String> {
    let accounts = read_accounts().await?;
    let account = accounts
        .into_iter()
        .find(|account| account.id == account_id)
        .ok_or_else(|| "Microsoft account not found".to_string())?;

    refresh_account_if_expired(&account).await
}

async fn fetch_minecraft_profile(
    client: &Client,
    account: &MicrosoftAccount,
) -> Result<MinecraftProfile, String> {
    let resp = client
        .get(MC_PROFILE_URL)
        .bearer_auth(&account.access_token)
        .send()
        .await
        .map_err(|e| format!("MC profile request: {e}"))?;

    parse_minecraft_profile_response(resp, "MC profile").await
}

async fn parse_minecraft_profile_response(
    resp: Response,
    context: &str,
) -> Result<MinecraftProfile, String> {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("{context} error {status}: {body}"));
    }

    serde_json::from_str::<MinecraftProfile>(&body)
        .map_err(|e| format!("{context} parse: {e}; body: {body}"))
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
        return fetch_minecraft_profile(client, account).await;
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

#[tauri::command]
pub async fn list_microsoft_accounts() -> Result<Vec<MicrosoftAccount>, String> {
    read_accounts().await
}

#[tauri::command]
pub async fn remove_microsoft_account(id: String) -> Result<(), String> {
    let mut accounts = read_accounts().await?;
    accounts.retain(|a| a.id != id);
    write_accounts(&accounts).await
}

#[tauri::command]
pub async fn get_minecraft_profile(account_id: String) -> Result<MinecraftProfile, String> {
    let account = refreshed_account_by_id(&account_id).await?;
    let client = Client::new();
    fetch_minecraft_profile(&client, &account).await
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
    let client = Client::new();
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
    let client = Client::new();
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
    let client = Client::new();
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
    let client = Client::new();
    let resp = client
        .delete(format!("{MC_PROFILE_URL}/capes/active"))
        .bearer_auth(&account.access_token)
        .send()
        .await
        .map_err(|e| format!("Hide cape request: {e}"))?;

    profile_from_mutation_response(&client, &account, resp, "Hide cape").await
}

#[tauri::command]
pub async fn start_microsoft_auth(app: AppHandle) -> Result<MicrosoftAccount, String> {
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
    let client = Client::new();
    let ms_tokens = exchange_code(&client, &code).await?;
    let refresh_token = ms_tokens.refresh_token.unwrap_or_default();
    let ms_expires = ms_tokens.expires_in.unwrap_or(3600);

    // Complete auth chain
    let account = do_auth_chain(&ms_tokens.access_token, refresh_token, ms_expires).await?;

    // Save (replace if same Minecraft UUID already stored)
    let mut accounts = read_accounts().await?;
    accounts.retain(|a| a.uuid != account.uuid);
    accounts.push(account.clone());
    write_accounts(&accounts).await?;

    Ok(account)
}
