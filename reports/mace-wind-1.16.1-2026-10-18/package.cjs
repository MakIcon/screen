const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'extensions/mineflayer-bot');
const stage = path.join(root, 'dist-extensions/mineflayer-bot');
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const json = (file, data) => fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2) + '\n');
// Reuse the already installed production dependencies only if the complete
// lockfile is identical apart from the extension's own release version.
const normalizeLock = folder => {
  const lock = read(path.join(folder, 'package-lock.json'));
  delete lock.version;
  delete lock.packages[''].version;
  return JSON.stringify(lock);
};
if (normalizeLock(stage) !== normalizeLock(source)) throw new Error('Dependencies changed; run full npm ci packaging');
if (!fs.existsSync(path.join(stage, 'node_modules/mineflayer/package.json'))) throw new Error('Staging dependencies missing');
const installer = fs.readFileSync(path.join(root, 'src-tauri/src/plugins/optional_extensions.rs'), 'utf8');
const section = installer.slice(installer.indexOf('const MINEFLAYER_FILES:'), installer.indexOf('#[derive(Clone, Debug, Serialize)]'));
const files = [...section.matchAll(/\(\s*"([^"/\\]+)"\s*,/g)].map(match => match[1]);
if (!files.includes('mace.cjs') || !files.includes('knockback.cjs')) throw new Error('Missing installer modules');
const manifest = files.map(file => {
  const data = fs.readFileSync(path.join(source, file));
  fs.copyFileSync(path.join(source, file), path.join(stage, file));
  return { file, bytes: data.length, sha256: digest(data) };
});
json('package-files.json', manifest);
const archive = read(path.join(source, 'pathfinder-source.json'));
const mismatches = Object.entries(archive.files).filter(([file, data]) => fs.readFileSync(path.join(source, file), 'utf8') !== data)
  .map(([file]) => file);
json('source-verification.json', { files: Object.keys(archive.files).length, mismatches });
if (mismatches.length) throw new Error('Source archive does not match working files');
if (typeof require(path.join(stage, 'knockback.cjs')).expectWindBoost !== 'function') throw new Error('Staged wind boost unavailable');
console.log(JSON.stringify({ version: read(path.join(stage, 'package.json')).version, files: files.length,
  sourceFiles: Object.keys(archive.files).length, dependencyLock: 'unchanged except release version', smoke: 'ok' }));
