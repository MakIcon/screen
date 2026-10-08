# PvP and bow combat

Mineflayer Bot 1.7.2 includes the locked published packages:

- `@nxg-org/mineflayer-custom-pvp` 1.7.16: sword tactics and bow trajectory planner.
- `mineflayer-pvp` 1.3.2: selectable basic melee combat.
- `minecrafthawkeye` 1.3.9: selectable bow trajectory planner.

Documentation and implementation references:

- https://github.com/nxg-org/mineflayer-custom-pvp
- https://github.com/nxg-org/mineflayer-custom-pvp/blob/master/src/sword/API.md
- https://github.com/sefirosweb/minecraftHawkEye
- https://github.com/PrismarineJS/mineflayer-pvp/blob/master/docs/api.md

The attached Custom PvP source identifies itself as the scoped nxg package.
The extension installs its published build, so it does not depend on a Downloads
folder or on TypeScript compilation during installation.

## Settings

Open Extensions → Mineflayer Bot → PvP / Лук. Changes apply on the next bot start.
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
Smooth aiming uses Custom PvP's smooth-look plugin with an easing curve without
overshoot. Both melee engines wait until the view ray reaches the enemy before
attacking, and bow aiming also turns smoothly. Stopping cancels pending turns.
Aim speed (`smoothAimSpeed`) is adjustable from 10% to 300% while smooth aiming
is enabled. 100% preserves the original speed; 50% doubles turn duration and
200% halves it. It affects both melee and bow aiming, without changing navigation
rotation speed. The Novice/Normal/Expert presets use 50%/100%/175% respectively.
Existing settings default to 100%; changes apply on the next bot start.

Auto style uses a bow beyond melee range plus two blocks, and melee nearby.
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

## Commands

Only launcher owners can use these commands through the configured chat/whisper
channel. Replace `!` with the configured command prefix:

- `!attack Player`: attack using the selected style.
- `!sword Player`: force melee.
- `!bow Player`: force ranged combat, with the configured fallback.
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

`pnpm test:worker` includes combat lifecycle, world visibility, melee attack and
bow tests against 1.8.8, 1.20.4 and 26.1.2 registries and a simulated world.
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
