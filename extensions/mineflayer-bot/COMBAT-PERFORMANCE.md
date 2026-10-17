# PvP decision latency, 1.15.5 → 1.15.6

Measured on 2026-10-17 with Node 24.13.1 and an AMD Ryzen 5 9600X.
Baseline source: `747ff486cdd9c227e0c601c08d86a23d212bd1ea`.

The benchmark uses the existing Minecraft 26.1.2 world/physics fixture, 35 occupied
main-inventory slots plus an offhand shield, netherite armour and 66 entities. Each implementation ran three
trials with 100 timed samples after warmup. The table reports the
median of the three trial medians. Initialization and world creation are excluded.
The smallest operations use batches to reduce timer noise.

| Decision                          | Before, ms | After, ms | Speedup |
| --------------------------------- | ---------: | --------: | ------: |
| Action and inventory capabilities |     0.0006 |    0.0004 |   1.53× |
| Open-ground pursuit corridor      |     0.0246 |    0.0089 |   2.76× |
| New crystal layout                |     0.8349 |    0.5452 |   1.53× |
| Continue a crystal layout         |     0.5563 |    0.1301 |   4.28× |
| Crystal on an existing base       |     0.7736 |    0.4155 |   1.86× |
| Travel pearl trajectory           |    17.8691 |    8.7316 |   2.05× |
| Exact pursuit pearl trajectory    |    25.5333 |   13.0033 |   1.96× |

Each paired run verifies identical selected actions, damage estimates, pearl
angles, flight durations and landing points. Full precision, per-trial medians,
P95 summaries, operation counts and settings are saved in
[`decision-benchmark-results.json`](decision-benchmark-results.json).

The controller tests also measure **simulated game time**, including actual
serialized placement and attack packets, at 50 ms physics steps:

| Scenario                                                         | Before |  After |
| ---------------------------------------------------------------- | -----: | -----: |
| Foundation → crystal → attack, 100 ms configured action interval | 300 ms | 150 ms |
| Confirmed new base → crystal placement                           | 250 ms |  50 ms |
| Opponent enters blast range → crystal placement                  | 250 ms |  50 ms |

These are local calculation and simulated controller measurements. Live duel
outcomes and end-to-end server latency were not measured.

All 190 combat tests pass, including melee, defense, mace, crystal tactics and
pearl utilities. ESLint and Prettier pass for the changed files. The full worker
suite passed 488/489 tests. The existing function-identity assertion in
`worker honors disabled STAY ON WATER and disconnect removes the overlay` fails
identically against the baseline snapshot; its worker and navigator bundles are
unchanged by this update.

## What changed

- Crystal searches reuse block reads, entity lists, motion prediction and blast
  exposure within one synchronous decision. Verification after equip/aim creates
  a fresh frame, including health, cover and nearby owners.
- Reach bounds skip impossible foundations. An active combination checks its
  selected foundation directly instead of scanning the surrounding volume again.
- Movement reuses block reads across the three player-width samples in one
  corridor check; the next check reads the world again.
- Pearl search builds entity bounds once, excludes entities outside the possible
  horizontal flight path, and avoids repeating quantized aim candidates. All
  terrain, fluid, collision and landing checks still run on candidate flights.
- Inventory capabilities refresh on slot updates, with the existing 250 ms
  fallback. Every combat decision reads current health and enemy state.
- Block confirmations, nearby motion, equipment and metadata updates invalidate
  crystal proposals. Position/health snapshots also catch movement without an
  event. A feasible next action resumes as soon as its configured cooldown ends.

## Reproduce

From the repository root:

```powershell
pnpm --filter @screenlauncher/mineflayer-bot benchmark:combat
pnpm test:worker
```

`SCREEN_BENCH_SAMPLES` changes the timed sample count (default 40). To compare
against a separate source snapshot, point `SCREEN_COMBAT_RUNTIME` at its extension
directory, which must have access to the same dependencies. The local baseline
snapshot used for these measurements is under
`extensions/mineflayer-bot/.decision-baseline.local`.

```powershell
New-Item -ItemType Directory -Force .bench-results.local | Out-Null
$env:SCREEN_BENCH_SAMPLES = '100'
$env:SCREEN_COMBAT_RUNTIME = "$PWD/extensions/mineflayer-bot/.decision-baseline.local"
node extensions/mineflayer-bot/decision-benchmark.mjs .bench-results.local/before.json
Remove-Item Env:SCREEN_COMBAT_RUNTIME
node extensions/mineflayer-bot/decision-benchmark.mjs .bench-results.local/after.json .bench-results.local/before.json
```

The final argument enables output-equivalence checks and prints the comparison.
Timing has no hard pass threshold because CPU load and runtimes vary. The three
controller reaction scenarios in `crystal-tactics.test.mjs` enforce the improved
150/50/50 ms simulated deadlines. Running these new deadline assertions against
the original source intentionally fails and reports its measured delays.
