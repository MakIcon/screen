# PvP, mace and bow combat

## Faster PvP decisions (1.15.6)

The director reuses inventory capabilities, corridor block reads, crystal damage
calculations and pearl collision bounds within each decision. Crystal plans
refresh on movement, health, block confirmations and opponent state changes.
Ready combinations resume at their action cooldown instead of waiting for the
next broad scan. Equip/aim verification always reads a fresh world state.

Measured exact pearl planning is about 2× faster, open-ground pursuit checking
2.76× faster, and continuing crystal layouts 4.28× faster. In the packet/physics
fixture, foundation → crystal → attack takes 150 ms instead of 300 ms at a
100 ms action interval. See [the benchmark report](COMBAT-PERFORMANCE.md) for
the workload, full comparison, raw summaries and reproduction commands.

## Water entry and low-ceiling sprint jumps (1.15.5)

Water entry keeps one continuous dive until physics confirms the swimming pose.
Navigation and combat jump inputs yield during entry and surface cruising, so
crouching cannot repeatedly raise the eyes and cancel the dive. Shallow water,
shore climbing, low hunger and legacy flotation retain their previous controls.

The movement setting `allowLowCeilingJumps` (enabled by default in the worker) repeats normal
sprint jumps beneath a two-block ceiling, releasing jump in the air to jump
again on landing. It works independently of parkour in mined tunnels, ordinary
navigation and either PvP engine's pursuit under leaves. It requires sprint,
food and a clear supported corridor, and yields to crouching, digging, terrain
interactions, item use, axe attacks, pearls and survival actions. Turning it off
also prevents the navigator's optional sprint hops beneath low ceilings. Saved
movement settings apply after restarting the bot. The native pathfinder option
can also be enabled or disabled with `pathfinder.setMoveOptions()`.

Physics regressions on 1.20.4 and 26.1.2 cover competing jump inputs during water
entry, enabled/disabled tunnel and canopy travel, repeated head collisions,
navigation arrival and hazards. Both PvP engines also chase from shore into
water and under leaves using the bundled worker.

## Stable melee focus and shield timing (1.15.4)

Melee aim follows the live target once per tick along the shortest yaw change,
including the -180/180 degree seam. It does not restart a smooth-look tween on
each update. The aim point remains inside the target's hitbox while jumping;
immediately before an axe strike it is checked again against actual reach and
the current view ray. The outgoing attack publishes that rotation first.

A normal critical jump keeps its checked ground corridor through the apex, so
pathfinding cannot turn the camera towards a route node halfway through the hit.
Axe cycles disable strafing, stop horizontal input for the jump and keep ownership
until landing. Auto mode retains that axe sequence. The bot holds its shield
while charging, lowers it before jumping/striking, and restores the preferred
weapon after the enemy lowers its shield. Restoring a sword waits for the real
weapon cooldown; sword and axe minimum cooldowns also correct the upstream timing
table. Without an available shield break, it holds its shield and faces a blocking
opponent without pointless critical jumps. Shield use has no delayed re-raise
callback that can survive stop, target loss or another combat mode.

`defense.test.mjs` checks default smooth aim/strafe settings with a moving target
at the yaw seam, the first charged falling axe hit, shield release at the attack,
the absence of routing at the jump apex, steady blocking and sword restoration.
These use Mineflayer physics and real versioned packet serialization on 1.20.4
and 26.1.2; they do not confirm a live server's damage or shield-disable rules.

## Continuous pursuit and committed combinations (1.15.3)

Adaptive melee sprints along checked open ground even beyond 16 blocks. When
progress stalls for 650 ms, or an obstacle blocks the corridor, navigation owns
movement and aim for at least 1.8 seconds before a clear six-block corridor can
return control to direct pursuit. Combat rotation, strafing, critical jumps and
sprint taps yield to that route. Distant entity updates use a 2–4 block margin
and at least 600 ms between replans; close escapes and large teleports update
immediately. Both attack engines retain selected enemies through the director's
allowed range, including pearl range when chase is enabled.

A crystal setup equips its next required item and starts on the selection tick.
Pending confirmations are checked each tick rather than waiting for the layout
cache. A committed base/cover sequence may finish despite a marginal score change,
with a bounded commitment; damage, health, pressure, owner and geometry checks
still apply. The configured action interval remains enforced. Confirmed crystals
finish before pearl pursuit. After a mace strike, an expired hit-confirmation
window retains the airborne controller until landing, so Auto cannot swap to an
axe or initiate another pearl in midair. Survival rescue can still take over.

With `pearlChase`, melee/auto/crystal combat also tries a safe throw at a distant
selected opponent who has never used a pearl. The threshold is
`max(8, pearlMinDistance)` and the maximum is `pearlMaxDistance`. Failed plans
continue on foot and are reconsidered at most once per 750 ms. A throw requires
a landing within 2.5 blocks of the current destination, checked again after aim.
Only one throw may be active; arrival resumes combat against the same enemy.
Explicit ranged style retains its distance unless following an enemy teleport.

## Adaptive combat director (1.15.0)

The **АГРЕССИВНЫЙ** preset enables adaptive combat, combat healing, crystal
tactics and pearl travel/escape, zero initial reaction delay, full melee skill,
fast aim and sprint resets. Inventory and the existing damage, health and travel
permission limits still apply. New settings alone do not enable crystals/pearls;
select this preset or enable those features explicitly.
Existing explicit reaction/skill settings remain editable. New configurations
default to zero reaction delay and 100% melee skill. `adaptiveCombat` can be
disabled to retain the original distance-based engine selection.

The director runs before the attack engines on every physics tick (normally
50 ms). It reads current health, damage received over the last two seconds,
distance, visibility, active enemy items, blocking, equipment and available
healing/pearls. Inventory is cached for 250 ms and invalidated by slot updates.
Decision evaluation is synchronous; it does not wait for aim, inventory swaps,
critical-hit timers or path searches. Execution still respects real weapon
cooldowns, the configured CPS, reach, visibility and the server's confirmations.

Priorities and commitments:

- At 12 HP or below, create space for healing if supplies are available. At 7 HP
  or below, survival takes priority over finishing the opponent.
- A visible, unshielded enemy reporting at most 4 effective HP within four blocks
  triggers finishing pressure when the bot has more than 5 HP. No additional
  critical jump is started for that finish; a hit still needs actual reach and aim.
- A raised shield selects the existing charged axe shield-break cycle. Enemy
  food/potion/bow use triggers pressure instead of a switch to ranged combat.
- Open, level ground uses direct forward pursuit. Close combat uses short,
  stable lateral bursts while maintaining pressure. Each diagonal corridor is
  checked for support/headroom. Walls, steps, gaps, water and unknown terrain
  remain the existing navigator's responsibility. Taking damage does not
  automatically stop forward movement or start an asynchronous critical wait.
- Auto style stays in melee up to 14 blocks, and leaves ranged mode at ten blocks.
  This margin avoids repeated swaps at one distance threshold. Mace plus wind
  charge is selected with at least 12 HP, an available launch site and a target
  within eight blocks. Airborne sequences retain ownership until completion;
  low ceilings and unavailable launches retain ordinary melee. Explicit weapon,
  ranged and crystal modes remain supported.
- Recovery chooses a checked waypoint away from the target. At six blocks of
  separation or behind cover it consumes a golden apple (including at full
  hunger) or ordinary safe food. It waits for server consumption confirmation,
  then resumes the same target without another reaction delay. Apples have a
  five-second reuse window to allow their effects to work. Ordinary hunger uses
  ordinary food. Combat healing currently supports food and golden apples;
  potion selection/use is not implemented.
- `pearlEscape` uses the existing trajectory planner to create healing distance
  when `pearlEnabled` is also enabled. Health, inventory reserve, cooldown,
  loaded terrain, safe landing and one-flight limits still apply. It does not
  require `pearlChase`. A failed pearl plan falls back to retreat on foot.
- Retreat is bounded to 2.2 seconds; a failed route returns to combat with a
  two-second retry delay. Critically low health permits a last-resort meal when
  the retreat times out. Empty supplies never start an endless retreat loop.
  Stop, target loss, death and a new command cancel queued healing and throws.

Enemy health comes only from the current version's named entity metadata,
including reported absorption. Missing values are **unknown**, not an assumed
20 HP or a guess based on hit animations. Vanilla servers or server plugins can
hide or substitute this information; the director uses distance, shields, item
use and its own health when enemy HP is unavailable. It does not treat arbitrary
scoreboard points as HP. `pvp status` includes the action and observed HP.

`combat-brain.test.mjs` covers decision priorities, unknown HP/absorption, cache
invalidation, food selection, checked footwork and a decision microbenchmark.
Combat/survival/utility tests cover retreat → confirmed meal → immediate combat,
cancellation, mode hysteresis, bounded recovery and safe escape pearls.
The microbenchmark measures only the decision layer, not pathfinding or network
latency. Live duel performance still needs verification on the intended server.

### Crystal decisions in adaptive Auto style

Carrying crystals no longer forces the bot to stay in crystal mode. It compares
feasible explosions with weapon pressure: enemy damage, self damage, known enemy
HP, recent incoming damage and the number of setup steps. It ranks an immediate
break above equal damage requiring construction, rewards a predicted lethal
blast, and prefers an immediate weapon finish over building a new base.
Nonlethal trades exceeding 65% self/enemy damage are rejected; recent burst damage
or low HP at melee distance prevents starting a foundation/cover sequence.
Lethal predictions never override minimum health, maximum self damage or owner
protection. Available lower-damage but more profitable layouts can outrank the
largest raw explosion. All geometry, prediction, armour and chain-explosion
checks remain active.

The expensive layout probe is shared by selection and execution, normally every
150 ms under pressure or 300 ms otherwise. Confirmed spawn/removal, block changes
and incoming hits invalidate it. Immediately before execution, geometry, health,
damage and profitability are checked again. The bot holds the current sequence
through bounded server confirmations and promptly breaks its confirmed crystal.
If finishing becomes unsafe/blocked it tries repositioning for up to 1.2 seconds,
then returns to weapon pressure while retaining the crystal for later safe cleanup.
An unavailable or poor setup keeps the bot attacking instead of waiting with a
crystal in its hand. Explicit **Кристаллы Края** mode remains dedicated crystal
combat and still obeys all safety limits; the profitability comparison belongs
to adaptive **Авто** mode.

### Crystal movement (1.15.2)

Layout searches use copies of the player's coordinates. They never round or
write the live physics position, so repeated planning cannot snap a walking bot
back to a block corner. Approach movement updates once per tick, and an active
turn finishes before placement takes ownership of the aim. A reachable action
holds position through its cooldown, equipment change and server confirmation.

The controller keeps a useful reposition waypoint until arrival or a bounded
three-second deadline. It only chooses positions that permit a real next action;
an unavailable layout does not trigger arbitrary sidesteps or retreats. On a
checked direct approach, less than 0.12 blocks of progress over 650 ms hands
movement to the terrain planner for at least 1.8 seconds. Reaching the desired
range releases movement before testing obstacles farther ahead.

Mineflayer Bot includes the locked published packages:

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

### Mace and wind charges (Java 1.21+)

Select **Ближний бой → Оружие → Булава + заряд ветра** and carry a mace and
wind charges. The mace controller works with both engine selections. It follows
the target using the normal terrain planner, finds solid ground with headroom,
jumps after braking residual horizontal momentum, then aims straight down below
its current feet and throws a charge during the initial ascent.
The shield stays in the offhand; the controller switches its main hand back to
the mace while keeping movement released until an observed upward impulse
confirms the boost. Only then does it steer toward the target, so projectile
travel and server response delay cannot make it run away from the blast point.
The server receives the current airborne position and downward look before the
charge use packet. Braking and boost confirmation each have a one-second limit;
failed launches use a one-second retry delay instead of spending more charges.

An airborne strike requires a real descent of more than 1.5 blocks, line of sight
and eye-to-hitbox reach within the configured maximum of 3 blocks. Grounded mace
attacks use its 0.6 attack speed; wind charges respect their 500 ms cooldown.
Server damage feedback confirms a hit before continuing an observed Wind Burst
bounce. After a successful grounded landing it starts another wind jump; an
unconfirmed strike/missed launch uses a bounded recovery delay. The bot never
assumes the server accepted a strike just because an attack packet was sent.
Raised enemy shields stop the combo; Custom PvP uses a carried axe first when
shield breaking is enabled. Without charges or headroom it uses ordinary mace
attacks. Without a supported mace item it falls back to sword/axe combat.
Stop, target loss, shield defense, pearl travel and survival cancel pending actions.
Emergency MLG yields briefly to an imminent reachable smash, and can take over
when the target is out of reach, hidden or blocking.

**Защита от булавы** (`maceDefense`, on by default) extends the existing shield
controller independently of the arrow-defense switch. It predicts a descending
mace user's approach and raises the shield early, allowing for the five-tick
activation delay, while continually facing that player. It also estimates motion
from position updates when the server's velocity is stale. Grounded carriers,
trajectories passing away from the bot and attacks behind solid cover do not
trigger this defense. The same pause/resume lifecycle as arrow defense prevents
navigation and attacks from overwriting the defensive aim.

Mechanics references:

- [Mojang: Java 1.21 release notes](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21)
  (smash threshold, Wind Burst and wind-charge cooldown).
- [Minecraft Wiki: Mace](https://minecraft.wiki/w/Mace),
  [Wind Charge](https://minecraft.wiki/w/Wind_Charge),
  [Blocking](https://minecraft.wiki/w/Blocking), and
  [PvP](https://minecraft.wiki/w/Tutorial:Player_versus_Player).

### General combat settings

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
Smooth melee aiming uses a bounded turn from the current view on every tick;
bow aiming uses Custom PvP's smooth-look plugin with an easing curve without
overshoot. Both melee engines wait until the view ray reaches the enemy before
attacking. Stopping cancels pending turns.
Aim speed (`smoothAimSpeed`) is adjustable from 10% to 300% while smooth aiming
is enabled. 50% halves the turn rate and 200% doubles it. It affects both melee
and bow aiming, without changing navigation
rotation speed. The Novice/Normal/Expert presets use 50%/100%/175% respectively.
Existing settings default to 100%; changes apply on the next bot start.

Auto style approaches directly in crystal mode when placement is enabled and
crystals are carried, without first starting melee strafing or critical jumps.
On clear level ground it turns toward the enemy and walks forward, releasing
forward to stop at placement distance with a restart margin. It does not brake
backward or repeatedly strafe to center on each block. Obstacles, gaps, liquids,
unloaded terrain and elevation changes use the existing pathfinder.
When no crystals are carried it prioritizes a safe crystal break, then uses the
director's pressure/ranged decisions. With the director disabled it uses a bow
beyond melee range plus two blocks, and melee nearby.
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

`pearlChase` (disabled by default) enables the **ПРЕСЛЕДОВАНИЕ ЖЕМЧУГОМ**
toggle. It works with PvP enabled independently of `pearlEnabled`, which controls
ordinary travel. In addition to closing long distances, the bot recognizes the selected player's
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
