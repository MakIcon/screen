# PvP and bow combat

Mineflayer Bot 1.8.13 includes the locked published packages:

- `@nxg-org/mineflayer-custom-pvp` 1.7.16: sword tactics and bow trajectory planner.
- `mineflayer-pvp` 1.3.2: selectable basic melee combat.
- `minecrafthawkeye` 1.3.9: selectable bow trajectory planner.
- `mineflayer-armor-manager` 2.0.1: automatic armour equipment on spawn/respawn and pickup.

Documentation and implementation references:

- https://github.com/nxg-org/mineflayer-custom-pvp
- https://github.com/nxg-org/mineflayer-custom-pvp/blob/master/src/sword/API.md
- https://github.com/sefirosweb/minecraftHawkEye
- https://github.com/PrismarineJS/mineflayer-pvp/blob/master/docs/api.md
- https://github.com/PrismarineJS/MineflayerArmorManager

The attached Custom PvP source identifies itself as the scoped nxg package.
The extension installs its published build, so it does not depend on a Downloads
folder or on TypeScript compilation during installation.

## Settings

Open Extensions → Mineflayer Bot → PvP / Предметы. Changes apply on the next bot start.
The Novice, Normal and Expert presets change melee skill, reaction, CPS, tactics,
bow accuracy, prediction and shot interval; individual controls remain editable.

Combat is enabled by default, with manual target selection. The optional automatic
mode selects nearby visible hostile mobs, never players. Explicit commands can
target any loaded player, including an authorized owner. The bot cannot attack itself.

The melee skill slider adds skipped attack opportunities. Reaction sets the delay
before beginning an attack. CPS caps attacks, while modern Minecraft weapon
cooldowns still apply. Custom PvP supports circle/random/intelligent strafing,
jump/short-hop critical hits, sprint resets, shields, axe shield breaking and smooth
aim. Basic Mineflayer PvP uses skill, CPS, weapon, reach and shield settings; the
Custom tactics do not apply to that engine. Reach is limited to 3 blocks.
Both melee engines and crystal pursuit first search for a route without breaking
or placing terrain blocks, including one-block jumps and walking around obstacles.
Navigation digs or builds only after that search finds no route, subject to the
existing movement permissions and carried materials. A planning timeout retries
movement without treating the time limit as a reason to alter the battlefield.
Custom axe shield breaking reads active-hand metadata for the current Minecraft
version, charges the axe cooldown, jumps and strikes while falling independently
of the general critical-hit setting. Stop, target loss and bow defense cancel
the cycle. The preferred weapon is restored after the
opponent lowers its shield; an axe weapon preference stays an axe.
With only axes available, Custom PvP automatically chooses an axe even with a
sword preference and prepares a falling critical for every charged attack,
including when shield breaking and general criticals are disabled. With both
weapon types carried, selecting an axe and enabling criticals uses that same
cycle to prioritize repeated criticals. Sword combat retains its chosen critical
mode. Water/lava do not allow these criticals and use charged ordinary attacks.
ArmorManager runs even with PvP disabled. Armour swaps share the combat inventory
queue, and its offhand selection is excluded so a totem cannot replace the shield
during defense. Equipment errors are reported through the worker.
Smooth aiming uses Custom PvP's smooth-look plugin with an easing curve without
overshoot. Both melee engines wait until the view ray reaches the enemy before
attacking, and bow aiming also turns smoothly. Stopping cancels pending turns.
Aim speed (`smoothAimSpeed`) is adjustable from 10% to 300% while smooth aiming
is enabled. 100% preserves the original speed; 50% doubles turn duration and
200% halves it. It affects both melee and bow aiming, without changing navigation
rotation speed. The Novice/Normal/Expert presets use 50%/100%/175% respectively.
Existing settings default to 100%; changes apply on the next bot start.

Auto style approaches directly in crystal mode when placement is enabled and
crystals are carried, without first starting melee strafing or critical jumps.
On clear level ground it turns toward the enemy and walks forward, releasing
forward to stop at placement distance with a restart margin. It does not brake
backward or repeatedly strafe to center on each block. Obstacles, gaps, liquids,
unloaded terrain and elevation changes use the existing pathfinder.
When no crystals are carried it prioritizes a safe crystal break, then
uses a bow beyond melee range plus two blocks, and melee nearby.
The ranged style stays with the bow; its optional melee fallback applies when a
bow or arrows are missing. Equip a bow and normal, spectral or tipped arrows in
the inventory. Bow range is limited to 120 blocks. The offhand option is effective
only on Minecraft versions with a second hand.

Bow accuracy controls additional angular scatter; 100% removes it. This is not
a promised hit percentage. Prediction uses the entity tracker's velocity.
Both planners model projectile trajectories. The controller checks visibility,
charges a bow for at least 1.2 seconds and applies the configured shot interval.
HawkEye's automatic attack/radar loops are not started: the extension owns the
bow lifecycle so engines cannot shoot concurrently or leave timers behind.
Stopping a charged bow releases it into the ground because Minecraft fires when
use is released. Target death, disappearance, distance loss and disconnect all
cancel combat. Reconnect starts a new controller; manual targets are not retained.

## Bow awareness and defense

`bowDefense` enables awareness of aiming bows/crossbows
and incoming arrows, including while following an owner. Recognition now reads
live entity updates directly, rather than waiting for the tracker cache.
`bowDefenseMode` selects early aim/draw recognition or simulated trajectories;
`bowDefenseCheckMs`, `bowDefenseRange`, `bowDefenseMargin`, `bowDefenseHoldMs`
control polling, range, expanded hit bounds and shield release delay.
`bowDefenseRequireDraw` ignores bows just held without drawing (using the
version's living entity metadata, including the offhand). Rotation/equipment/
metadata/spawn updates trigger immediate checks independent of the poll interval.
Arrow simulation includes gravity, drag, short/full bow draws and terrain.
Threats appear in the
worker status. With `shield` enabled, a shield in inventory or already in the offhand and an offhand-capable
version, the bot faces the threat and raises its shield. It releases the shield
when the threat clears. Defense interrupts offensive bow charging and crystal
actions. Releasing a bow retains protection through the predicted flight time
and packet arrival grace; `bowDefenseHoldMs` applies after that time. Incoming
arrows refresh their flight direction from movement updates, so a stale spawn
velocity cannot discard an arrow as it falls. Impact, disappearance or a passed
trajectory clears the flight hold; missing updates have a bounded timeout.
Item swaps are serialized and stale actions cannot resume over defense.
The offhand bow preference does not disable shield defense. Travel pauses and
resumes after defense. Detection does not select or attack the shooter. Stop/death/disconnect
invalidate pending equips and turns. This feature is disabled by default.

## Auto Crystal

`crystalEnabled` enables crystal tactics in auto style and the dedicated crystal
style/command. `crystalPlace` and `crystalBreak` independently allow placement
and breaking. The planner searches loaded obsidian/bedrock within
`crystalPlaceRange`, checks two blocks of air (also valid on legacy versions),
entity overlap, visible clickable faces and reach. `crystalBuildBase` allows building
an obsidian foundation from carried items. `crystalCover` allows a protective full
block between bot and explosion when it reduces predicted self damage.
It builds cover only when needed to meet the damage/health limits, rather than
adding more walls after the position is already safe.
If a raised crystal exposes the bot above a low block, cover may require a second
block supported by the first. Materials must be available; armour and cover do
not bypass the configured damage/health limits.
`crystalCoverBlock` selects obsidian, planks, cobblestone or automatic material selection.
The bot waits for server block confirmation before continuing.
Cover also applies to breaking an existing crystal. If cover would obstruct placing
the crystal, it is built after placement and before breaking; the planner checks a
visible part of the crystal above cover. New foundations prefer reachable positions
toward the target (or the bot in proximity mode) and reuse existing safe bases first.
It ranks existing positions by
`crystalPriority` (damage or proximity). It breaks confirmed server entities within
`crystalBreakRange`; it never invents entity IDs or treats a placement packet as
a confirmed spawn. Reservations bound placement retries and repeat attacks.

`crystalMinDamage` gates new placements and attacks on other crystals.
The bot remembers its confirmed placements and finishes those explosions even
when the target moves away and damage falls below that minimum. It completes
the existing crystal before constructing another layout. `crystalMaxSelfDamage`,
`crystalMinHealth` and owner protection still gate every action.
Damage uses exposure rays, difficulty, known armour/toughness, protection and resistance;
unknown equipment remains conservative. A cover block is simulated before placement;
it is not assumed to protect against later explosions in a crystal chain.
all connected loaded crystal explosions contribute to the self/owner safety
bound. `crystalProtectOwners` refuses damage to other owners (an explicitly
selected owner remains an intentional combat target). `crystalPredict` and
`crystalPredictionTicks` check both the present and predicted target position.
`crystalIntervalMs` caps construction/placement and ordinary break actions.
A confirmed crystal placed by this bot can be broken on the next tick without
waiting out that interval; repeated attacks still wait for removal confirmation.
Damage and world constraints are checked again
after equipping and aiming. The current view ray must hit the actual block face
or crystal; the placement cursor uses that same intersection. The bot stays still
while waiting for server confirmation. Unsafe/missing positions produce a rate-limited status
explaining why the bot is waiting. Default limits are preserved.
The rewrite has one managed action loop instead of independent placement,
breaking, explosion and sound-triggered loops. It uses normal Mineflayer APIs.
The selected base and cover budget persist until that cycle finishes. Cover blocks
do not become new competing foundations in the middle of the cycle.
`crystalFastAim` defaults to immediate exact rotation. With it disabled, smoothing
gets 100 ms before exact rotation; actions never await SmoothLook's sometimes
unresolved completion promise. `crystalMaxCoverBlocks` bounds cover per cycle.
`crystalSpawnTimeoutMs` and `crystalRetries` bound waiting/retries for a server
spawn. Auto style retains crystal mode while waiting, and a rejected layout gets
a temporary cooldown rather than more construction.
Foundation/cover clicks use the same confirmation deadline and retry bound.
Confirmation is checked on subsequent ticks without Mineflayer's blocking 5000 ms
block-placement wait. Rejected clicks keep combat running and select another
layout after bounded retries; blocked layouts are reconsidered after 1 second.
Confirmed crystal removal immediately frees the base for the next placement,
subject to the action interval and the same damage, health and space limits.

Approach uses forward movement with gradual turns, a stopping margin and normal
jumps over single-block steps. It does not use reverse or side inputs to brake.
Walls, liquids, unloaded ground and larger drops use the existing navigator.
If close players occupy placement space or obstruct a crystal attack, the bot
chooses a nearby standing position with usable reach, visibility and damage.
That waypoint persists while moving instead of changing direction on every tick.
Recent hits trigger faster close-range replanning. Placement and confirmation
pause movement, then a completed explosion starts the next cycle.

## Pearl travel

`pearlEnabled` is independent of the PvP master switch. `pearlFollow`, `pearlCome`
and `pearlGoto` allow throws only for their corresponding movement commands.
Follow uses the player's current position; come keeps the requested position;
auto-follow on spawn uses the same travel controller. The bot first starts its
normal route, then tries a safe throw which saves at least `pearlMinDistance`
and lands within `pearlMaxDistance` of the bot. Both shallow and lobbed arcs are
simulated tick by tick with launch velocity, inherited bot velocity, swimming
eye height, air/water drag, version-specific gravity/drag order, block and entity
collision. Throws can leave water for a dry shore. Unknown chunks, hazardous
flight paths, liquid landings,
wall impacts and landing spots without solid support or headroom are refused.

`pearlMinHealth` (minimum 6 HP), `pearlReserve` and `pearlCooldownMs` limit use.
There is at most one pearl in flight. The bot pauses navigation, equips, replans
after stopping, verifies its actual rotation/velocity again after aiming,
flushes its look packet, throws and waits for the actual position
change. It restores the held item and resumes the original goal after arrival.
If the server does not teleport it by the bounded deadline, it resumes walking
and backs off before retrying. `pearlChain` allows more throws after arrival;
otherwise each movement command can use at most one pearl. Missing pearls,
short distances or no safe route continue on foot. Stop, death, new commands
and disconnect cancel pending throws; a pearl already thrown cannot be recalled.
Projectile randomness and server plugins can change the actual landing, so
server testing is still needed for edge/platform throws.

`pearlChase` (disabled by default) enables the **ПРЕСЛЕДОВАТЬ ЖЕМЧУГ ПРОТИВНИКА**
toggle. With PvP and pearl use enabled, the bot recognizes the selected player's
pearl from its spawn packet and predicts its impact. Modern owner IDs are checked;
legacy ownerless packets require an unambiguous nearby thrower. Spawn velocity,
velocity updates and observed projectile movement drive the prediction.
The bot throws toward that same landing area only if a safe arc reaches within
2.5 blocks, pauses combat through its teleport and resumes against the selected
enemy. A bounded grace period preserves the target beyond ordinary combat range
and across teleport despawn/respawn. Normal cooldown, health, inventory reserve
and one-flight limits apply. Stop, target death, new targets and disconnect cancel
pending pursuit. An unreachable landing never triggers a partial travel throw.
`pearlChain` applies to movement commands; separate enemy throws can each trigger
one pursuit. The swimming/tick-order model follows the motion described by
[MinecraftMotionTools](https://github.com/OrHy3/MinecraftMotionTools) and water
drag in [projectile-trajectories](https://github.com/Bactrosaurus/projectile-trajectories).

The supplied mineflayer-ender and mineflayer-auto-crystal-rewrite sources were
used as design references for these rewritten controllers:

- https://github.com/nxg-org/mineflayer-ender
- https://github.com/nxg-org/mineflayer-auto-crystal-rewrite

No files are loaded from Downloads and no extra runtime dependency is required.

## Commands

Only launcher owners can use these commands through the configured chat/whisper
channel. Replace `!` with the configured command prefix:

- `!attack Player`: attack using the selected style.
- `!sword Player`: force melee.
- `!bow Player`: force ranged combat, with the configured fallback.
- `!crystal Player`: force crystal tactics (must be enabled in settings).
- `!attack nearest` / `!bow nearest`: select the closest loaded hostile mob.
- `!pvp auto`: enable hostile mob selection for this connection.
- `!pvp stop` or `!stop`: stop combat and suspend automatic selection.
- `!pvp status`: show the target/mode or idle status.

`come`, `follow`, `goto`, `look` and `jump` stop combat and suspend auto selection.
Run `!pvp auto` to resume it. Restarting uses the saved auto-selection setting.
Self targeting is rejected without changing the current task. Named targets must
be loaded by the server and within the configured range; a player in the tab list
alone is not enough. Combat checks line of sight through the world, without
requiring the bot to already face the target.

The classic entity-follow API used by the combat plugins is adapted to the
launcher's existing dynamic entity goals. The launcher keeps its movement
settings and supplied pathfinding rewrite; a second navigator is not loaded.

## Packaging and verification

The Behavior tab has an `АНТИОТБРАСЫВАНИЕ` toggle, disabled by default (also for
legacy settings). With it off, nearby players and mobs push the bot and server
hit/explosion impulses apply normally. With it on, those impulses are suppressed
while walking, jumping, falling and server position corrections remain active.
The adapter preserves native `lpVec3` speeds on newer protocols (including
1.21.11 and 26.1.2), instead of dividing those decoded speeds by 8000 again.
Save the setting and restart the bot to apply it. Server team collision rules
can still disable body pushes independently of this setting.

`pnpm test:worker` includes combat lifecycle, world visibility, melee attack and
bow tests against 1.8.8, 1.20.4 and 26.1.2 registries and a simulated world.
Knockback checks also cover 1.21.11 and verify actual player displacement after
serialized hit packets. Crystal checks simulate forward pursuit, obstacle
fallback, rejected block confirmations and consecutive placement/break cycles.
`crystal-tactics.test.mjs` covers fleeing targets, close melee pressure, occupied
placement space, entity-obstructed attacks and two stepped terraces using real
player physics and serialized placement/attack packets on 1.20.4 and 26.1.2.
`utility.test.mjs` also checks real serialized pearl throws on those versions,
safe/blocked/unknown terrain, pearl permissions/cooldown/chaining, teleport
timeout/cancellation, crystal exposure/owner safety/reservations and bow defense.
Outgoing combat packets are checked by the real Minecraft protocol serializer.
The compatibility adapter translates legacy attacks to the separate `attack`
packet on 26.1 and supplies movement flags for older plugin packet writers.
This validates API compatibility and cancellation without connecting to a user's
server. Server-specific damage, anti-cheat and real duel performance require an
in-game check on the intended server.

`pnpm package:extensions` ships the updated worker, combat configuration/code,
locked production dependencies and corresponding source in the extension ZIP.
For an existing launcher installation, install/update Mineflayer Bot through the
Extensions screen using a launcher built from this source, or use the new ZIP.
