This standalone Mineflayer worker and its combined Pathfinder are distributed
under GPL-3.0-only. The complete license is in COPYING. The launcher communicates
with this separate worker over standard input/output.

Gathering integrations added in 1.9.0 use mineflayer-statemachine 1.7.0 and
mineflayer-tool 1.2.0 (PrismarineJS / TheDudeFromCI, MIT). Their license files
remain in the installed dependency packages. mineflayer-collectblock and the
supplied Mineflayer-Templates mining/woodcutting/task-queue sources were reviewed
as design references. The gathering controller is an original implementation
for this worker's existing navigator; these reference sources are not copied.
Baritone MineProcess.java and BuilderProcess.java were reviewed for rescan,
unreachable-target and top-down cuboid clearing behavior. See GATHERING.md.

The original Minecraft Pathfinding 2026 Rewrite is Copyright GenerelSchwerz,
MIT according to its supplied package manifest. The named author and standard
MIT text are included in pathfinding/LICENSE in the supplied source.
The combined version includes a modified TypeScript adaptation of
Botcraft's PathfindingTask.cpp vertical movement and AdjustPosSpeed routines
(https://github.com/adepierre/Botcraft, GPL version 3). These modifications add
Mineflayer controls, climb entry/exit phases, bounded movement and vine support.
The adaptation is in pathfinding/src/mineflayer-specific/movements/climb.ts and
pathfinding/src/mineflayer-specific/movements/controls.ts.

External physics/utility packages retain their GPL-3.0 notices in node_modules;
all other dependency license files are retained with their packages.

Potion support added in 1.16.0 was developed using the supplied
nxg-org/mineflayer-auto-buff 1.5.0 sources by GenerelSchwerz (GPL-3.0) as a design
reference. The local auto-buff.cjs and potion-data.cjs replace its standalone
listeners, selection and drinking loops with version-aware potion recognition,
confirmed use, bounded waits, shared inventory ownership and cancellation.
https://github.com/nxg-org/mineflayer-auto-buff
The supplied Custom PvP 1.7.16 and Ender sources were also reviewed for this
integration. Their downloaded builds are not installed over the existing
launcher integrations. All local changes ship as corresponding source under
GPL-3.0-only; the complete license is retained in COPYING.

The local auto-eat.cjs module adapts the supplied linkle69/mineflayer-auto-eat
5.0.3 source (Copyright (c) 2023 Link, MIT). Its original license is retained
verbatim in AUTO-EAT-LICENSE. Lifecycle, inventory ownership and survival
scheduling have been rewritten for this standalone CommonJS worker.
https://github.com/linkle69/mineflayer-auto-eat

Navigation changes in 1.8.12 use the supplied Baritone 26.1 sources as a design
reference: MovementAscend.java, MovementDescend.java, PathExecutor.java and
AbstractNodeCostSearch.java. The ascent approach, supported landing and partial
path selection rules are adapted for Mineflayer's controls and physics.
Baritone is by cabaletta and the Baritone contributors, LGPL-3.0-or-later:
https://github.com/cabaletta/baritone
Its supplied license is included verbatim in BARITONE-LICENSE. No Java classes
or Baritone binaries are installed or loaded by this worker.

Combat integrations added in 1.7.0 use:
- @nxg-org/mineflayer-custom-pvp 1.7.16, GenerelSchwerz, GPL-3.0.
- mineflayer-pvp 1.3.2, TheDudeFromCI / PrismarineJS, MIT.
- minecrafthawkeye 1.3.9, sefirosweb, ISC.
- mineflayer-armor-manager 2.0.1, G07cha / PrismarineJS, MIT.
The original license files remain in their installed node_modules packages.
Editable launcher combat code, defaults and tests are in the corresponding
source archive alongside the worker and Pathfinder source.

The 1.8.0 pearl and crystal controller rewrites were developed using the supplied
nxg-org/mineflayer-ender (GPL-3.0) and nxg-org/mineflayer-auto-crystal-rewrite (MIT)
sources as design references. They use the existing Mineflayer dependency APIs;
the downloaded plugin builds are not installed or loaded at runtime.
https://github.com/nxg-org/mineflayer-ender
https://github.com/nxg-org/mineflayer-auto-crystal-rewrite

Corresponding source is included in pathfinder-source.json. Run:

    node restore-pathfinder-source.cjs C:\work\pathfinder-source

From the restored directory, install the worker dependencies with npm ci, then
install the compiler dependencies with npm --prefix pathfinding install, compile
with npm --prefix pathfinding run build, and bundle with node build-pathfinder.mjs.
The source includes the exact manifests, npm worker lockfile, TypeScript files,
tests, build scripts and original notices used for this release.
- `mineflayer-web-inventory` 1.8.5 (MIT), https://github.com/imharvol/mineflayer-web-inventory:
  live window/inventory server. This extension supplies its own Russian browser
  client for the plugin's window protocol; it does not copy the upstream Svelte client.
