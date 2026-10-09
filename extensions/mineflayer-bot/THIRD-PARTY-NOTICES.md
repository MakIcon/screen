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

Combat integrations added in 1.7.0 use:
- @nxg-org/mineflayer-custom-pvp 1.7.16, GenerelSchwerz, GPL-3.0.
- mineflayer-pvp 1.3.2, TheDudeFromCI / PrismarineJS, MIT.
- minecrafthawkeye 1.3.9, sefirosweb, ISC.
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
