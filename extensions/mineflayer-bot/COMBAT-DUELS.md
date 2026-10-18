# Melee duel benchmark, 1.15.6 → 1.15.7

`pvp-duel-benchmark.mjs` runs simulated duels with real Mineflayer player
physics (prismarine-physics), the published Custom PvP plugin, the launcher
navigator and the real versioned packet serializer. The opponent is a scripted
entity; Mineflayer receives its moves, metadata and swings as usual events.

A small vanilla server model scores every serialized attack packet:

- attack strength `(ticks since the last attack or item switch + 0.5) / 12.5`
  for the diamond sword, 7 damage scaled by `0.2 + strength² · 0.8`;
- critical (×1.5): charged, bot airborne and falling, server sprint flag off;
  sprint hit: charged with the server sprint flag on, which then clears it, as in
  vanilla. The flag follows the bot's `entity_action` packets;
- 10-tick hurt invulnerability (only the damage difference counts) and reach
  of at most 3 blocks from the eyes to the hitbox;
- knockback 0.4 (+0.5 for a sprint hit) that decays ×0.546 on the ground and
  ×0.91 in the air, with gravity; walls stop the opponent;
- shields: an opponent facing the bot blocks once its shield has been used for
  5 ticks. The bot reports a 50 ms ping; the model adds one tick of entity sync
  and 50 ms of round trip, so a hit later than the second tick after the bot
  saw the raise is blocked.

The opponent never attacks, so the bot's health, healing and retreat logic do
not interfere. There is no network jitter. Each scenario is deterministic (fixed
seeds, fixed 50 ms clock); repeated runs give identical outcomes. CPU time per
tick is the only measured wall-clock value. These are simulation results, not
live server duels.

Profiles: `default` is `combat-defaults.json` (Auto style, adaptive director,
intelligent strafing, hop criticals, W-tap, shield). `aggressive` is the
АГРЕССИВНЫЙ preset. The bot carries a diamond sword and an offhand shield and
uses the worker's default movement settings (sprinting and parkour allowed).

## Results

Measured on 2026-10-17 with Node 24.13.1 and an AMD Ryzen 5 9600X. Before is
`0c57fcd` (1.15.6), after is 1.15.7. Three alternating runs per version gave
identical outcomes. Minecraft 1.20.4 and 26.1.2 produced the same numbers; the
26.1.2 tables are shown. Damage is in half-hearts (HP) without armour.

Default settings:

| Opponent                                                       |        Hits |          Damage | First hit, ms | Criticals |
| -------------------------------------------------------------- | ----------: | --------------: | ------------: | --------: |
| Standing opponent in reach, takes full knockback               |  8 → **10** |     56 → **70** |     200 → 200 |     0 → 0 |
| Opponent pinned against a wall (no knockback travel)           | 13 → **16** |    91 → **161** |     200 → 200 |    0 → 14 |
| Standing opponent 12 blocks away                               |   3 → **5** |     21 → **35** |   1800 → 1600 |     0 → 0 |
| Opponent sprints away from 5 blocks                            |   0 → **5** |    0 → **45.5** |      — → 3200 |     0 → 3 |
| Opponent zigzags away (sprint, ±55° every 0.75 s)              |   3 → **7** |   21 → **52.5** |    1000 → 950 |     0 → 1 |
| Opponent circle-strafes at 3 blocks                            |  9 → **12** |   66.5 → **84** |     200 → 200 |     1 → 0 |
| Shield user: up 16 ticks, lowers 4 ticks to swing              | 15 → **15** | 105 → **108.5** |     850 → 850 |     0 → 1 |
| Shield raised 1 tick before the bot's hit is ready, held 0.6 s | 10 → **18** |    70 → **126** |     200 → 200 |     0 → 0 |
| Opponent eats a golden apple 8 blocks away                     |   1 → **2** |    7 → **17.5** |   1250 → 1200 |     0 → 1 |
| Opponent on a 2-block pillar 4 blocks away                     |   0 → **4** |      0 → **28** |       — → 350 |     0 → 0 |
| **Total**                                                      | 62 → **94** | 437.5 → **728** |               |    1 → 20 |

АГРЕССИВНЫЙ preset:

| Opponent                                                       |        Hits |          Damage | First hit, ms | Criticals |
| -------------------------------------------------------------- | ----------: | --------------: | ------------: | --------: |
| Standing opponent in reach, takes full knockback               |  7 → **13** |  49 → **101.5** |     150 → 150 |     0 → 3 |
| Opponent pinned against a wall (no knockback travel)           | 13 → **14** |    91 → **119** |     150 → 150 |     0 → 6 |
| Standing opponent 12 blocks away                               |   3 → **6** |   21 → **45.5** |   1750 → 1550 |     0 → 1 |
| Opponent sprints away from 5 blocks                            |   0 → **5** |    0 → **45.5** |      — → 2750 |     0 → 3 |
| Opponent zigzags away (sprint, ±55° every 0.75 s)              |  3 → **10** |   21 → **87.5** |     950 → 850 |     0 → 5 |
| Opponent circle-strafes at 3 blocks                            |  9 → **13** |     63 → **91** |     150 → 150 |     0 → 0 |
| Shield user: up 16 ticks, lowers 4 ticks to swing              | 15 → **15** |   105 → **105** |     850 → 850 |     0 → 0 |
| Shield raised 1 tick before the bot's hit is ready, held 0.6 s | 11 → **19** |  80.5 → **133** |     150 → 150 |     1 → 0 |
| Opponent eats a golden apple 8 blocks away                     |   1 → **2** |      7 → **14** |   1200 → 1150 |     0 → 0 |
| Opponent on a 2-block pillar 4 blocks away                     |   0 → **1** |       0 → **7** |       — → 300 |     0 → 0 |
| **Total**                                                      | 62 → **98** | 437.5 → **749** |               |    1 → 18 |

What the rows show:

- Against the cornered opponent the mean interval between hits dropped from
  817 ms to exactly 650 ms (13 ticks). Before, the lifted opponent counted as a
  terrain step: the navigator took over and the bot stood next to it with a
  ready sword for 1.4 s; afterwards it struck every 14 ticks. With the shield
  no longer cancelling jumps, 14 of 16 hits are criticals.
- The sprinting runner was never caught before; sprint jumps close about 0.7
  blocks per jump.
- After the first hit on the pillar the opponent is knocked behind it, and the
  navigator then routes around the pillar in both versions.
- The periodic shield user is already hit at every lowered window, so its row
  barely changes. The late raise is hit inside the warm-up window; the model
  blocked none of the bot's attacks in either shield scenario.
- Median CPU time of all physics-tick listeners stays at 0.04–0.19 ms per 50 ms
  tick (before: 0.03–0.23 ms). Most rows are faster because less time is spent
  in the navigator; raw per-run values are in the report's `raw/` directory.

## Reproduce

```powershell
node --no-deprecation extensions/mineflayer-bot/pvp-duel-benchmark.mjs out.json
$env:SCREEN_COMBAT_RUNTIME = "<snapshot of the 1.15.6 extension sources>"
node --no-deprecation extensions/mineflayer-bot/pvp-duel-benchmark.mjs before.json
```

The second argument of a run compares it with a saved JSON file.
`SCREEN_DUEL_VERSIONS` (default `1.20.4,26.1.2`), `SCREEN_DUEL_SCENARIOS` and
`SCREEN_DUEL_TRACE=<scenario>` (per-tick controls and hits) narrow a run.
`duels.test.mjs` turns the main improvements into regression tests; all six fail
against the 1.15.6 sources.
