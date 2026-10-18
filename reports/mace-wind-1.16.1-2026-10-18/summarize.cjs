const fs = require('node:fs');
const path = require('node:path');
const read = file => {
  const bytes = fs.readFileSync(path.join(__dirname, file));
  return bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
};
const stats = file => {
  const output = read(file), result = { log: file };
  for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'duration_ms']) {
    const match = output.match(new RegExp('^(?:#|ℹ)\\s+' + key + '\\s+([\\d.]+)', 'm'));
    if (!match) throw new Error(`Missing ${key}: ${file}`);
    result[key] = Number(match[1]);
  }
  return result;
};
const summary = {
  version: '1.16.1', generatedAt: new Date().toISOString(),
  before: { runtime: '1.16.0', ...stats('before.txt') },
  focused: stats('focused.txt'), packaged: stats('packaged-tests.txt'), worker: stats('worker-tests.txt'),
  miningRecheck: stats('mining-recheck.txt'),
  source: JSON.parse(read('source-verification.json')), package: JSON.parse(read('package-verification.json')),
  build: { pathfinder: 'build.txt', rust: 'rust-check.txt' }, liveServerTested: false,
};
fs.writeFileSync(path.join(__dirname, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(summary);
if ([summary.focused, summary.packaged, summary.worker].some(result => result.fail || result.cancelled || result.skipped) ||
    summary.source.mismatches.length || summary.package.mismatches.length) process.exitCode = 1;
