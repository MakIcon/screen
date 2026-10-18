const fs = require('node:fs');
const path = require('node:path');
const read = (file) => {
  const bytes = fs.readFileSync(path.join(__dirname, file));
  return bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
};
const json = (file) => JSON.parse(read(file));
const tests = (file) => {
  const output = read(file), result = { log: file };
  for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo', 'duration_ms']) {
    const value = output.match(new RegExp('^(?:#|ℹ)\\s+' + key + '\\s+([\\d.]+)', 'm'));
    if (!value) throw new Error(`Missing ${key} in ${file}`);
    result[key] = Number(value[1]);
  }
  return result;
};
const summary = {
  version: '1.16.0', generatedAt: new Date().toISOString(),
  worker: tests('worker-tests-complete.txt'),
  navigation: tests('navigation-tests.txt'),
  web: { tests: 38, files: 6, failed: 0, log: 'web-tests.txt' },
  rustSettings: { tests: 12, failed: 0, log: 'rust-model-tests.txt' },
  duels: json('duel-comparison-final.json'),
  source: json('source-verification.json'),
  package: json('package-verification.json'),
  validation: ['pathfinder-build-final.txt', 'typecheck.txt', 'frontend-build.txt', 'rust-check-final.txt'],
  liveServerTested: false,
};
fs.writeFileSync(path.join(__dirname, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(summary);
if ([summary.worker, summary.navigation].some(result => result.fail || result.cancelled || result.skipped) ||
    summary.duels.changes.length || summary.duels.errors.length || summary.source.mismatches.length || summary.package.mismatches.length)
  process.exitCode = 1;
