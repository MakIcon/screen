import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export function gistFromEndpoint(endpoint) {
  const match =
    /^https:\/\/gist\.githubusercontent\.com\/([\w-]+)\/([a-f0-9]+)\/raw\/latest\.json$/.exec(
      endpoint,
    );
  if (!match) {
    throw new Error(
      "Updater endpoint must be a revision-free GitHub Gist URL: " +
        "https://gist.githubusercontent.com/<owner>/<gist-id>/raw/latest.json",
    );
  }
  return { owner: match[1], id: match[2] };
}

export async function manifestGist(api, gist) {
  const data = await api(`gists/${gist.id}`);
  if (data.owner?.login?.toLowerCase() !== gist.owner.toLowerCase()) {
    throw new Error(`Gist ${gist.id} does not belong to ${gist.owner}.`);
  }
  if (!data.files?.["latest.json"]) {
    throw new Error(`Gist ${gist.id} does not contain latest.json.`);
  }
  return data;
}

export function githubToken(cwd) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) return token.trim();

  const options = { cwd, encoding: "utf8", windowsHide: true };
  const gh = spawnSync("gh", ["auth", "token", "--hostname", "github.com"], options);
  if (gh.status === 0 && gh.stdout.trim()) return gh.stdout.trim();

  // Reuse the account already saved by Git Credential Manager. Keep credentials
  // in memory and disable interactive login prompts during release builds.
  const git = spawnSync("git", ["-c", "credential.interactive=never", "credential", "fill"], {
    ...options,
    input: "protocol=https\nhost=github.com\n\n",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
  });
  const password = git.stdout?.split(/\r?\n/).find((line) => line.startsWith("password="));
  if (git.status === 0 && password) return password.slice("password=".length);

  throw new Error("GitHub login not found. Sign in with gh auth login or set GH_TOKEN.");
}

export function githubClient(token, fetchImpl = globalThis.fetch) {
  return async (route, { method = "GET", body, binary = false, allowMissing = false } = {}) => {
    const host = binary ? "https://uploads.github.com" : "https://api.github.com";
    const response = await fetchImpl(`${host}/${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ScreenLauncher-release",
        ...(body === undefined
          ? {}
          : { "Content-Type": binary ? "application/octet-stream" : "application/json" }),
      },
      ...(body === undefined ? {} : { body: binary ? body : JSON.stringify(body) }),
      signal: globalThis.AbortSignal.timeout(120_000),
    });
    if (allowMissing && response.status === 404) return null;
    if (response.status === 204) return null;
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        `GitHub ${method} ${route}: ${response.status} ${data.message || "request failed"}`,
      );
    }
    return data;
  };
}

export async function releaseForTag(api, repo, tag) {
  const release = await api(`repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
    allowMissing: true,
  });
  if (release?.immutable) {
    throw new Error(`Release ${tag} is immutable. Publish a new version instead.`);
  }
  return release;
}

export async function publishLauncherRelease({
  api,
  repo,
  tag,
  title,
  notes,
  installerPath,
  manifestText,
  endpoint,
}) {
  const gist = gistFromEndpoint(endpoint);
  // Catch a missing or misconfigured Gist before replacing any release assets.
  await manifestGist(api, gist);
  let release = await releaseForTag(api, repo, tag);
  if (!release) {
    release = await api(`repos/${repo}/releases`, {
      method: "POST",
      body: { tag_name: tag, name: title, body: notes || "", draft: true },
    });
  }

  const installerName = path.basename(installerPath);
  const oldInstaller = release.assets.find((asset) => asset.name === installerName);
  if (oldInstaller) {
    await api(`repos/${repo}/releases/assets/${oldInstaller.id}`, { method: "DELETE" });
  }
  await api(
    `repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(installerName)}`,
    {
      method: "POST",
      binary: true,
      body: fs.readFileSync(installerPath),
    },
  );

  if (release.draft) {
    await api(`repos/${repo}/releases/${release.id}`, {
      method: "PATCH",
      body: { draft: false },
    });
  }

  // Announce the update only after the installer is available for download.
  await api(`gists/${gist.id}`, {
    method: "PATCH",
    body: { files: { "latest.json": { content: manifestText } } },
  });

  // Migrate releases previously published by the old script. Signatures remain
  // embedded in the manifest; neither metadata file belongs in release assets.
  for (const asset of release.assets) {
    if (asset.name === "latest.json" || asset.name === `${installerName}.sig`) {
      await api(`repos/${repo}/releases/assets/${asset.id}`, { method: "DELETE" });
    }
  }
}
