import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { URL } from "node:url";
import {
  githubClient,
  publishLauncherRelease,
  updaterEndpoint,
} from "./launcher_release_github.mjs";

const repo = "MakIcon/screen";
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

function publication(t, steps) {
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
      }),
    done: () => assert.equal(steps.length, 0, "Expected all API requests to be made"),
  };
}

test("new release uploads only the installer before publishing the independent manifest branch", async (t) => {
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
    { route: `GET /repos/${repo}/git/ref/heads/updates`, status: 404 },
    {
      route: `POST /repos/${repo}/git/trees`,
      body: { sha: "tree-sha" },
      check: ({ body }) => {
        const { tree } = JSON.parse(body);
        assert.deepEqual(
          tree.map((file) => file.path),
          ["latest.json"],
        );
        assert.equal(tree[0].content, manifestText);
      },
    },
    {
      route: `POST /repos/${repo}/git/commits`,
      body: { sha: "commit-sha" },
      check: ({ body }) => assert.deepEqual(JSON.parse(body).parents, []),
    },
    {
      route: `POST /repos/${repo}/git/refs`,
      check: ({ body }) =>
        assert.deepEqual(JSON.parse(body), { ref: "refs/heads/updates", sha: "commit-sha" }),
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
    { route: `GET /repos/${repo}/git/ref/heads/updates`, body: { object: { sha: "head" } } },
    {
      route: `GET /repos/${repo}/contents/latest.json`,
      body: { sha: "old-manifest" },
      check: (_, url) => assert.equal(url.searchParams.get("ref"), "updates"),
    },
    {
      route: `PUT /repos/${repo}/contents/latest.json`,
      check: ({ body }) => {
        const data = JSON.parse(body);
        assert.equal(data.sha, "old-manifest");
        assert.equal(data.branch, "updates");
        assert.equal(Buffer.from(data.content, "base64").toString(), manifestText);
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
      route: `GET /repos/${repo}/git/ref/heads/updates`,
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

test("the built launcher's endpoint matches where the publisher writes the manifest", () => {
  const config = JSON.parse(
    fs.readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url)),
  );
  assert.deepEqual(config.plugins.updater.endpoints, [updaterEndpoint(repo)]);
});
