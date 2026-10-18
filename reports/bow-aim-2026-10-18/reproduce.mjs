import { runBenchmark } from "../../extensions/mineflayer-bot/bow-benchmark.mjs";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const trials = [];
for (let i = 0; i < 5; i++) {
  const result = await runBenchmark(i === 0 ? fileURLToPath(new URL("./results.json", import.meta.url)) : null);
  trials.push({ trial: i + 1, before: result.before, after: result.after });
}
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summary = {
  method: "Five consecutive paired runs, 756 cases per run; median of per-run statistics. Initialization, observation replay and independent scoring are excluded from planner timing. Hit counts are identical across all five runs.",
  trials, before: {}, after: {},
};
for (const side of ["before", "after"])
  for (const key of ["attempts", "hits", "hitPercent", "meanMs", "medianMs", "p95Ms"])
    summary[side][key] = median(trials.map((trial) => trial[side][key]));
writeFileSync(new URL("./timing-trials.json", import.meta.url), JSON.stringify(summary, null, 2) + "\n");
console.log("PAIRED SUMMARY", JSON.stringify({ before: summary.before, after: summary.after }));
