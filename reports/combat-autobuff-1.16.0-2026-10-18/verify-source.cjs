const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../extensions/mineflayer-bot');
const digest = (data) => crypto.createHash('sha256').update(data).digest('hex');
const archive = JSON.parse(fs.readFileSync(path.join(root, 'pathfinder-source.json'), 'utf8'));
const mismatches = Object.entries(archive.files).filter(([name, data]) =>
  fs.readFileSync(path.join(root, name), 'utf8') !== data).map(([name]) => name);
const result = {
  files: Object.keys(archive.files).length,
  mismatches,
  newModules: ['auto-buff.cjs', 'potion-data.cjs'].map(file => ({
    file, sha256: digest(fs.readFileSync(path.join(root, file)))
  }))
};
fs.writeFileSync(path.join(__dirname, 'source-verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(result);
if (mismatches.length) process.exitCode = 1;
