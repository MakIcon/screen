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
preserves incoming speed and searches the timing of preparatory sprint-jumps,
including hops from a stone runway onto a short ice rim. A longer runway can
use several hops before the ice. The solver prioritizes landing at the ice edge
and rebounding on the immediately following tick. The
run-up and final flight are one movement, including four-air-block gaps that
would otherwise use standing parkour alignment. A bot stopped at the ice rim
can back up along the available runway before starting the same sequence.
If a rim rebound is impossible, a verified running takeoff remains available.
Controls advance
on every physics tick; jump is released during flight to reset its cooldown.
Live prediction retains the actual ground state, velocity and jump cooldown,
and rechecks exclusion zones when choosing a flight. Ice does not guarantee
five air blocks from rest: an isolated two-block ice platform is still rejected
without enough incoming speed or a usable runway. Parkour/sprint settings apply.
Long rising jumps that the standing executor cannot reliably perform are
replaced by further supported construction.

### Ice momentum calculation

The native engine is `prismarine-physics` 1.11.1; see its
[movement and jump implementation](https://github.com/PrismarineJS/prismarine-physics/blob/master/index.js).
At 20 physics ticks/second, one tick is 50 ms. For a straight sprint without
effects, a grounded tick uses `f = 0.91 * slipperiness`,
`a = 0.98 * 0.13 * 0.1627714 / f^3`, then `dx = vx + a + J` and
`vx_next = f * dx`. `J = 0.2` only on a successful sprint-jump, otherwise zero.
In the air, `f = 0.91`, `a = 0.98 * 0.026`, and there is no new jump impulse.
The engine also integrates vertical motion and the player's collision box;
horizontal distance alone is insufficient to prove a landing.

Minecraft 26.1 uses the supporting collision block under the player's feet,
not necessarily the block below their center. Verified against the official
26.1.2 client (`Entity.checkSupportingBlock`, `Entity.getOnPos`,
`LivingEntity.travelInAir`), the last grounded edge tick can still use ice
friction after the center passes the ice face. Prismarine-physics samples only
the center, which incorrectly discarded that momentum and overestimated the
needed runway. `supportingBlockPhysics.ts` supplies the supporting full block's
friction to both predictions and live physics on 26.x. It retains the real
collision shapes, never adds a floor, and leaves older protocol behavior alone.
The support is carried between ticks and invalidated when position changes.

| Surface | Slipperiness | Ground velocity multiplier |
| --- | --- | --- |
| Stone | 0.6 | 0.546 |
| Ice, packed ice, frosted ice | 0.98 | 0.8918 |
| Blue ice | 0.989 | 0.89999 |

Legacy reproducible example from rest, tested with the native Mineflayer physics
plugin on 1.19.4: stone at x=0..12, blue ice at x=13..14, **five empty columns** at
x=15..19, landing at x=20..23; every floor has y=63 and z=0. Start at
(0.5,64,0.5). The solver sprints for ten ticks, then chains three preparatory
hops. It touches blue ice at x=14.999206 with vx=0.283828 blocks/tick and jumps
again on the immediately following tick (50 ms after contact). The final
12-tick flight lands at x=20.084907: **5.085701 blocks of center displacement**.
These coordinates and velocities are simulation results, not injected speed.
Other tested fixtures cover ordinary, packed and frosted ice with a five-block
ice rim, taking off within two ticks of landing. Timing is recomputed for the
actual position and velocity; these example numbers are not movement constants.

The single-ice fixture matching the rim setup uses stone at x=0..5, ice at x=6,
four empty columns x=7..10, and a two-block landing x=11..12. From x=0.5, the
simulated approach lands at x=6.877939 with vx=0.259289, then jumps on the next
tick without braking. Executed tests cover all four ice types and directions,
and starting from rest on the ice itself. The latter must first back up; its
run-up is selected and rechecked against the actual position and velocity.

The ice contact is an intermediate landing: proximity completion and dynamic
follow updates cannot interrupt the active approach/rebound sequence. They can
resume after reaching the opposite platform. A partial walking route ending on
an exposed ice rim is also held until the search verifies its continuation;
otherwise it would run to the ice, consume momentum, crouch, and stop there.

The user's saved platform has stone x=0..6, ice x=7, five empty columns x=8..12,
and a landing starting at x=13. With 26.1 supporting-block friction this setup
has a verified straight approach. A shorter setup also works from centered
rest: stone x=0..2, blue ice x=3, five empty columns x=4..8, landing at x=9.
The search starts its first preparatory hop at tick 2, lands at the ice edge,
then rebounds on the next tick. Tests execute three such short runways in
sequence, in all four directions, with forward view and no intermediate stop.

The executor checks the live position, velocity and jump cooldown before
installing controls synchronously at the physics boundary. When retreating
along the runway it faces the safe route before moving, including when the
player's center has slid past the ice face. Blocked takeoffs wait for a verified
route instead of consuming a runway prefix.

Preparation now predicts a short held movement followed by coasting and joins
that sequence directly to the verified flight. It checks the launch position
and live speed together, instead of alternating opposite keys to stop within
two millimetres of one coordinate. Longer retreats use walking speed; crouching
is reserved for the final approach. Small lateral offsets are accepted when the
whole trajectory still lands safely. Unchanged controls are held across ticks.
If coasting alone cannot hit a viable tick phase, preparation can include one
planned braking reversal. The live ice contact also retains at least 98% of
the planned contact speed, so early alignment cannot replace a strong rebound
with a marginal slower jump.

View changes also update Mineflayer's transmitted look immediately, and the
landing restores the forward view. The search refines straight approaches before
trying optional 45-degree air inputs. These use forward+right with a rotated
view so acceleration still follows the runway, while sprint-jump impulses stay
straight. Where those inputs are necessary, it returns the
view forward as early as native collisions allow, retaining at least 0.005 blocks
of pre-landing overlap or the original candidate's overlap if smaller. It never
decouples the simulated direction from the view sent to the server.

`allowAirStrafe` defaults to `false` in the worker, launcher settings and movement
options. The launcher exposes it as **TURN HEAD DURING JUMPS**. With it disabled,
both planning and live execution use straight input and view; a jump requiring
45-degree air inputs is rejected rather than turning anyway. Enabling it opts
into the additional native input candidates described above.

Consecutive collinear ice jumps are verified as one movement, using each native
landing's position and velocity to calculate the next approach (up to eight
gaps per candidate). Their controls share one synchronous tick queue, so an
intermediate landing does not clear sprint, crouch or stop at a block center.
The executor settles after the last jump, then normal routing continues to the
followed player, including updates received during the chain. Partial routes
ending near an unverified ice gap wait even when their prefix already includes
a momentum jump. Tests cover three consecutive jumps in all four directions
with straight view, a moving owner, opt-in five-air-column chains and a blocked
second takeoff. A saved eight-block first runway, six-block middle runway and
two five-air-column gaps also pass with straight view. If a landing at a block
center prevents the next short-runway takeoff, the planner tries four bounded
landing offsets within that block and verifies the resulting native velocity
against the following jump before selecting one.

The [parkour wiki's jumping analysis](https://www.mcpk.wiki/wiki/Jumping)
describes a 12-tick level jump, a 0.2 sprint-jump impulse, and resetting the jump
cooldown by releasing jump. Its [slipperiness analysis](https://www.mcpk.wiki/wiki/Slipperiness)
gives ground speed retention as `0.91 * slipperiness`: 0.8918 on ordinary ice
and 0.89999 on blue ice. [45-degree inputs](https://www.mcpk.wiki/wiki/45_Strafe)
normalize acceleration to 1.0 rather than 0.98. These explain why a single ice
block preserves incoming hop momentum but does not create an arbitrary boost.

Run-up limits are geometry and speed dependent. In the tested 26.1.2 level,
one-block-wide blue-ice fixture, starting centered at rest without effects or
a ceiling, two ordinary blocks plus ice already produce a verified straight
five-empty-column crossing; one ordinary block plus ice does not. Three ordinary
blocks plus ice also pass, including consecutive jumps. These are bounded solver
results for those starting conditions, not a universal minimum or maximum.
Already arriving with speed, other surfaces, headhitters and effects change the
range. Legacy 1.19.4 tests retain the older eight-block, opt-in 45-degree setup.
The planner tests each available runway and input timing through collisions.

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
