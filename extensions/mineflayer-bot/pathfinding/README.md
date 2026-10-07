# Minecraft pathfinding rewrite for ScreenLauncher

This is a source copy of the supplied `minecraft-pathfinding-2026-rewrite`
(`@nxg-org/mineflayer-pathfinder` 0.0.26, GenerelSchwerz, MIT).
The supplied README is preserved as `UPSTREAM.md`; it describes the upstream
project, while this file describes the integration shipped by ScreenLauncher.

The worker uses this planner and its movement executors through the generated
`../pathfinder.cjs`. The original `mineflayer-pathfinder` package is removed from
the worker's dependencies. The downloaded source directory is left intact.

Changes from the supplied source:

- Version 1.5.1 keeps the Neo camera facing its landing floor while turning
  around the wall. Back and strafe inputs preserve flight acceleration without
  backward camera turns; the planner bounds rotation between airborne ticks.
  Water exits can build a supported step against a shore or bridge pillar,
  then use ordinary dry towers to reach a higher player. Building respects
  inventory, placement settings and exclusions, without requiring digging.

- Version 1.5.0 adds STAY ON WATER in BEHAVIOR (enabled for new and legacy
  settings). A disposable input overlay holds normal Mineflayer water-jump
  controls while swimming, including when navigation ends or clears controls.
  It releases its override on land, death and disconnect. High falls into open
  water are allowed independently of MAX GROUND DROP, with water depth and
  headroom checks. Water landings cannot be merged with later swimming moves;
  the bot brakes over its landing column, resurfaces and can swim onto an island.

- Version 1.4.0 adds a TypeScript adaptation of Botcraft's vertical movement
  and velocity correction. Ordinary ladders, wall vines, twisting and weeping
  vines have explicit entry, ascent, descent and ledge-exit moves. Thin ladder
  shapes are not treated as solid landing floors. Straight-line optimization
  cannot replace a climbing phase. Climbing also works with parkour disabled.
- Native Mineflayer physics and predictive Botcraft physics recognize twisting
  and weeping vine segments and tips. Climbing goals hold their height rather
  than waiting three seconds for a nonexistent ground contact.
- Concurrent chunk/goal reset requests are coalesced and settled before a new
  route starts. Superseded optimizer listeners retire before their watchdog runs.
- Supported goal completion and velocity braking avoid premature flight
  completion and running off the far edge of a narrow landing. Descending
  parkour tests a feasible walk-off before simulating extra jumping approaches.
  Drops measure the actual fall to the landing surface, honor the configured
  maximum inclusively, and check the destination headroom at its correct column.
- Follow movement faces the player's direction when it agrees with the route,
  uses the player's height for pitch, and retains yaw at a reached waypoint.
  Jump aiming stays horizontal and specialized Neo flight controls keep their yaw.

- Stable Mineflayer 4.37.1 `physicsTick` execution, with one asynchronous step
  in flight at a time; no custom Mineflayer fork, Atomics busy waiting or private
  Node microtask draining is required.
- Worker search budgets: 5 ms per slice, 2.5 seconds per search and 20,000 retained
  nodes. Search yields to the event loop without waiting 50 ms for a physics tick.
  After 30 ms, a route that makes progress can start with up to 16 verified moves,
  then replan from the actual position. Exhausted budgets produce errors.
- Neo movement is integrated from Rewrite's standalone example geometry. Its
  executor searches a bounded flight with Mineflayer's own prismarine-physics,
  including a short run-up, escape-side selection, turning and landing. Flight
  controls advance synchronously for every physics tick, including catch-up ticks.
- Forward, diagonal and asymmetric gap jumps, raised and lowered landings, and
  the ladder/ladder-landing/around-corner example modules are registered by default.
  Ladder-only providers skip ordinary gap jumps and apply exclusion-zone costs;
  ladder prediction uses the real Mineflayer physics. Around-corner moves retain
  physics feasibility checks instead of executing an unverified fallback.
- Follow retargeting finishes an airborne jump before changing its destination.
  Jump input stays held until takeoff is observed. Executor state resets between
  moves, and recovery attempts and landing waits have finite bounds.
- Block-event subscriptions share one emitter listener. Chunk-sized update bursts
  debounce per position without creating temporary subscriptions. Disposing a
  callback is idempotent, and one-shot callbacks can be removed by their original
  function. The emitter's listener limit is unchanged.
- Empty paths, waiting follow goals, cancellation, rapid goal replacement,
  execution errors and disconnects release task state, controls and listeners.
- Final moves wait until the bot actually reaches the goal. Stalled movement
  reports an error after three seconds without progress in the worker.
- Euclidean `GoalNear` radius, a radius-aware heuristic and correctly floored
  `GoalBlock` coordinates. Follow validity and composite validity use `isValid`.
- Incremental LRU block updates and evictions preserve unrelated entries;
  unloaded block state queries return `undefined`; world listeners can be disposed.
- Worker settings control sprinting, parkour, digging and maximum drops.
  Placement and towers retain the previous worker's defaults and require
  inventory blocks. Unlimited liquid drops are disabled to honor the drop limit.

The 1.4.1 worker also handles jumping into head-height ladders, diagonal entries
and standing on a final ladder rung before jumping onto a higher wall. Ordinary
ladder entries and exits use the climbing controller even with parkour enabled.
One-block ground jumps include both ascent and landing in their cost, so an
adjacent bush does not get an artificial advantage over the ladder. Digging
preserves climbable blocks and the walls their ladders are attached to; other
obstacles remain diggable when the movement setting allows it.

Worker 1.6.0 stages high follow goals through a loaded, reachable shoreline when
starting in open water. After reaching dry ground it resumes the original goal,
using supported stairs, towers and bridges when inventory blocks permit it.
Adjacent ground stairs are placed from a crouched rim, then from outside the
new block before jumping. Mining costs include the selected tool, helmet
enchantments, water and unsupported footing, so a short build can beat a slow
survival tunnel. Unreachable placement faces and cancellation have bounded waits.

MomentumJump predicts both the runway and flight with Mineflayer's native
physics, including surface friction, current velocity and potion effects. It
preserves incoming speed and can sprint-jump on a sufficiently long ice runway
before crossing five air blocks. Ice does not guarantee that distance from rest:
with only two ice blocks and insufficient incoming speed the planner still
builds a safe extension. Parkour/sprint settings and exclusion zones apply.
Long rising jumps that the standing executor cannot reliably perform are
replaced by further supported construction.

Commands from the repository root:

```powershell
pnpm build:pathfinder
pnpm test:pathfinder
pnpm test:worker
pnpm package:extensions
```

Commit the rebuilt `pathfinder.cjs` with source changes. Tauri embeds it together
with `worker.cjs`, the manifest and the npm lockfile; production installs use
`npm ci --omit=dev --ignore-scripts` and do not compile TypeScript. The standalone
extension archive uses the same files and dependency lockfile.

The upstream package declares MIT; its supplied directory had no license file,
so the standard MIT text and named author are included in LICENSE. The combined
worker/pathfinder now uses GPL-3.0-only because of the Botcraft adaptation.
COPYING, THIRD-PARTY-NOTICES.md and the corresponding editable source bundle are
included in both the archive and embedded extension installer.
Its external physics and utility packages
(`@nxg-org/mineflayer-physics-util`, `@nxg-org/mineflayer-util-plugin`) declare
GPL-3.0 in their distributed manifests and retain their own license files.

Validation includes planning, block changes, exclusion zones, simulated movement
through Mineflayer's real physics plugin, dynamic follow cancellation and bundled
worker execution on Minecraft 1.20.4 and 26.1.2. Parkour fixtures include a 10-by-1
strip with a two-high wall in four orientations, a blocked escape side, a two-block
long wall, a moving player during the flight, ordinary up/down/diagonal gaps and
a ladder-assisted landing two blocks higher. No live server was used; latency,
server corrections and anticheat can affect a physically possible jump.
