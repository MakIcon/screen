import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { URL } from "node:url";
import { log } from "node:console";

// Bundle an offline catalogue with the same registry/icon/group rules as the
// live worker. Once connected, its actual server registry takes precedence.
const require = createRequire(
  new URL("../extensions/mineflayer-bot/package.json", import.meta.url),
);
const dependency = createRequire(require.resolve("mineflayer-web-inventory"));
const version = "26.1.2";
const catalog = require("./web-inventory.cjs").minecraftCatalog(
  { version, registry: require("minecraft-data")(version) },
  dependency("minecraft-assets")(version),
);
const directory = new URL("../src/data/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("minecraftCatalog.json", directory), JSON.stringify(catalog) + "\n");
log(`Minecraft ${version}: ${catalog.entries.length} offline catalogue entries`);
