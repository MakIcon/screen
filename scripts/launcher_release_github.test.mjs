import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { URL } from "node:url";
import {
  githubClient,
  gistFromEndpoint,
  publishLauncherRelease,
} from "./launcher_release_github.mjs";

const repo = "MakIcon/screen";
const gistId = "0123456789abcdef0123456789abcdef";
const endpoint = `https://gist.githubusercontent.com/MakIcon/${gistId}/raw/latest.json`;
const gist = {
  owner: { login: "MakIcon" },
  files: {
    "latest.json": {
      // API responses contain revision-specific URLs; never replace the
      // launcher's permanent endpoint with this value.
      raw_url: `https://gist.githubusercontent.com/MakIcon/${gistId}/raw/old-revision/latest.json`,
    },
  },
};
const installerName = "ScreenLauncher_0.2.0_x64-setup.exe";
const manifestText = `${JSON.stringify({
  version: "0.2.0",
  platforms: {
    "windows-x86_64": {
      signature: "test-signature",
      url: `https://github.com/${repo}/releases/download/0.2.0/${installerName}`,
    },
  },
})}\n`;

function publication(t, steps, gistStep = { route: `GET /gists/${gistId}`, body: gist }) {
  steps.unshift(gistStep);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "screenlauncher-release-test-"));
  const installerPath = path.join(dir, installerName);
  fs.writeFileSync(installerPath, "test-installer");
  t.after(() => {
    fs.unlinkSync(installerPath);
    fs.rmdirSync(dir);
  });
  const requests = [];
  const api = githubClient("test-token", async (url, options) => {
    requests.push({ url, ...options });
    const step = steps.shift();
    assert.ok(step, `Unexpected request: ${options.method} ${url}`);
    assert.equal(`${options.method} ${new URL(url).pathname}`, step.route);
    step.check?.(options, new URL(url));
    return new globalThis.Response(step.status === 204 ? null : JSON.stringify(step.body ?? {}), {
      status: step.status ?? 200,
    });
  });
  return {
    requests,
    run: () =>
      publishLauncherRelease({
        api,
        repo,
        tag: "0.2.0",
        title: "ScreenLauncher 0.2.0",
        notes: "Release notes",
        installerPath,
        manifestText,
        endpoint,
      }),
    done: () => assert.equal(steps.length, 0, "Expected all API requests to be made"),
  };
}

test("new release uploads only the installer before updating the existing Gist", async (t) => {
  const scenario = publication(t, [
    { route: `GET /repos/${repo}/releases/tags/0.2.0`, status: 404 },
    {
      route: `POST /repos/${repo}/releases`,
      body: { id: 10, draft: true, assets: [] },
      check: ({ body }) => assert.equal(JSON.parse(body).draft, true),
    },
    {
      route: `POST /repos/${repo}/releases/10/assets`,
      check: ({ body }, url) => {
        assert.equal(url.host, "uploads.github.com");
        assert.equal(url.searchParams.get("name"), installerName);
        assert.equal(body.toString(), "test-installer");
      },
    },
    {
      route: `PATCH /repos/${repo}/releases/10`,
      check: ({ body }) => assert.equal(JSON.parse(body).draft, false),
    },
    {
      route: `PATCH /gists/${gistId}`,
      check: ({ body }) => {
        assert.deepEqual(JSON.parse(body), { files: { "latest.json": { content: manifestText } } });
      },
    },
  ]);
  await scenario.run();
  scenario.done();
});

const existingRelease = {
  id: 10,
  assets: [
    { id: 1, name: installerName },
    { id: 2, name: "latest.json" },
    { id: 3, name: `${installerName}.sig` },
    { id: 4, name: "unrelated.txt" },
  ],
};

test("republication replaces the existing installer and removes old metadata after updating the manifest", async (t) => {
  const scenario = publication(t, [
    { route: `GET /repos/${repo}/releases/tags/0.2.0`, body: existingRelease },
    { route: `DELETE /repos/${repo}/releases/assets/1`, status: 204 },
    { route: `POST /repos/${repo}/releases/10/assets` },
    {
      route: `PATCH /gists/${gistId}`,
      check: ({ body }) => {
        const data = JSON.parse(body);
        assert.equal(data.files["latest.json"].content, manifestText);
        assert.deepEqual(Object.keys(data.files), ["latest.json"]);
      },
    },
    { route: `DELETE /repos/${repo}/releases/assets/2`, status: 204 },
    { route: `DELETE /repos/${repo}/releases/assets/3`, status: 204 },
  ]);
  await scenario.run();
  scenario.done();
});

test("an installer upload failure never publishes a manifest or removes legacy metadata", async (t) => {
  const scenario = publication(t, [
    { route: `GET /repos/${repo}/releases/tags/0.2.0`, body: existingRelease },
    { route: `DELETE /repos/${repo}/releases/assets/1`, status: 204 },
    {
      route: `POST /repos/${repo}/releases/10/assets`,
      status: 503,
      body: { message: "unavailable" },
    },
  ]);
  await assert.rejects(scenario.run(), /503 unavailable/);
  scenario.done();
});

test("a manifest publication failure keeps the legacy release manifest for a retry", async (t) => {
  const scenario = publication(t, [
    { route: `GET /repos/${repo}/releases/tags/0.2.0`, body: existingRelease },
    { route: `DELETE /repos/${repo}/releases/assets/1`, status: 204 },
    { route: `POST /repos/${repo}/releases/10/assets` },
    {
      route: `PATCH /gists/${gistId}`,
      status: 403,
      body: { message: "permission denied" },
    },
  ]);
  await assert.rejects(scenario.run(), /403 permission denied/);
  scenario.done();
});

test("immutable releases fail before any mutation", async (t) => {
  const scenario = publication(t, [
    {
      route: `GET /repos/${repo}/releases/tags/0.2.0`,
      body: { ...existingRelease, immutable: true },
    },
  ]);
  await assert.rejects(scenario.run(), /immutable/);
  scenario.done();
});

test("an inaccessible Gist fails before modifying a release", async (t) => {
  const scenario = publication(t, [], {
    route: `GET /gists/${gistId}`,
    status: 404,
    body: { message: "Not Found" },
  });
  await assert.rejects(scenario.run(), /404 Not Found/);
  scenario.done();
});

test("revision-pinned Gist URLs and old branch URLs are rejected", () => {
  for (const url of [
    `https://gist.githubusercontent.com/MakIcon/${gistId}/raw/revision/latest.json`,
    "https://raw.githubusercontent.com/MakIcon/screen/updates/latest.json",
    endpoint.replace("https:", "http:"),
    undefined,
  ]) {
    assert.throws(() => gistFromEndpoint(url), /revision-free GitHub Gist URL/);
  }
});

test("the built launcher uses a permanent Gist endpoint owned by the release account", () => {
  const config = JSON.parse(
    fs.readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url)),
  );
  assert.equal(config.plugins.updater.endpoints.length, 1);
  assert.equal(gistFromEndpoint(config.plugins.updater.endpoints[0]).owner, repo.split("/")[0]);
});
