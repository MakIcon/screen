This standalone Mineflayer worker and its combined Pathfinder are distributed
under GPL-3.0-only. The complete license is in COPYING. The launcher communicates
with this separate worker over standard input/output.

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

Corresponding source is included in pathfinder-source.json. Run:

    node restore-pathfinder-source.cjs C:\work\pathfinder-source

From the restored directory, install the worker dependencies with npm ci, then
install the compiler dependencies with npm --prefix pathfinding install, compile
with npm --prefix pathfinding run build, and bundle with node build-pathfinder.mjs.
The source includes the exact manifests, npm worker lockfile, TypeScript files,
tests, build scripts and original notices used for this release.
