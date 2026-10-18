const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const workspace = path.resolve(__dirname, '../..');
const source = path.join(workspace, 'extensions/mineflayer-bot');
const stage = path.join(workspace, 'dist-extensions/mineflayer-bot');
const digest = (data) => crypto.createHash('sha256').update(data).digest('hex');
if (!fs.existsSync(path.join(stage, 'node_modules/mineflayer/package.json')))
  throw new Error('Run scripts/package_optional_extensions.ps1 to install the locked dependencies first');
if (digest(fs.readFileSync(path.join(source, 'package-lock.json'))) !== digest(fs.readFileSync(path.join(stage, 'package-lock.json'))))
  throw new Error('Dependency lock changed; run the full packaging script');
const installer = fs.readFileSync(path.join(workspace, 'src-tauri/src/plugins/optional_extensions.rs'), 'utf8');
const section = installer.slice(installer.indexOf('const MINEFLAYER_FILES:'), installer.indexOf('#[derive(Clone, Debug, Serialize)]'));
const files = [...section.matchAll(/\(\s*"([^"/\\]+)"\s*,/g)].map((match) => match[1]);
if (!files.includes('auto-buff.cjs') || !files.includes('potion-data.cjs') || !files.includes('pathfinder.cjs'))
  throw new Error('Missing runtime modules in installer');
const verified = files.map((file) => {
  const data = fs.readFileSync(path.join(source, file));
  fs.copyFileSync(path.join(source, file), path.join(stage, file));
  return { file, bytes: data.length, sha256: digest(data) };
});
fs.writeFileSync(path.join(__dirname, 'package-files.json'), JSON.stringify(verified, null, 2) + '\n');
const survival = require(path.join(stage, 'survival.cjs'));
if (survival.normalizeSurvival({}).autoBuff !== true) throw new Error('Packaged AutoBuff failed to load');
console.log(JSON.stringify({ version: require(path.join(stage, 'package.json')).version, files: verified.length, smoke: 'ok' }));
