# Crafting, smelting and workstations

The launcher opens on **Сценарий**, with manual production under **Рабочие блоки**.
The same commands work in owner chat,
whispers and launcher commands, with or without the configured prefix. Existing
owner, channel and cooldown restrictions apply. Requests are validated before
replacing movement/gathering. Long jobs acknowledge immediately so `stop` stays
available. Resources must already be in the bot's inventory.

## Launcher scenarios

Build a sequence of up to 100 mining, forestry, crafting, smelting, collection,
storage and return steps on one screen. The iron tools template gathers coal
and iron, returns to the launch position, gathers wood, returns again, crafts
sticks, smelts iron and crafts four tools. Start beside an empty furnace with
a stone pickaxe or better; suitable deposits and trees must be accessible.
Crafting resolves intermediate recipes, including whichever planks the carried
logs can produce, and finds or creates a crafting table.

Drag an action row to insert it anywhere in the sequence; the insertion line
shows its destination and the list scrolls at the viewport edge. Arrow controls
remain available for keyboard use. Reordering is disabled during execution.
The draft is saved locally and can be edited offline. Execution belongs to the
worker and continues when the settings window closes. Each step waits for the
previous one to finish successfully. Names and limits are validated before
starting; inventory-dependent recipes are planned at the start of their step.
Partial gathering and blocked tasks stop the scenario with a reason. Automatic
survival recovery keeps waiting. Pause takes effect after the current step;
stop cancels active work and navigation immediately. Manual commands that would
interfere are rejected while a scenario is active. Disconnecting cancels the run.
Restarting a completed or failed scenario runs its entire sequence again.

Runs have a name, stable ID, start/end timestamps and a snapshot of every step.
Short plans use descriptive names; long plans combine material and purpose words.
The single Auto button restores automatic naming and cycles alternatives; the selected variant survives
reopening the editor. Different wood species, food, equipment, machinery,
building materials, dimensions and delivery routes have their own vocabulary.
The worker retains the latest 30 results in telemetry; the launcher merges them
by ID and saves the latest 50 locally. Successful runs move out of the matching
draft into **Завершённые сценарии**. **Все запуски** also shows stopped and failed
runs. Repeating loads a copy into the editor and requires pressing Start again.
Crafting waits for inventory updates between recipes and checks newly produced
output rather than counting an already carried tool as success. Cancellation
returns unused crafting inputs before releasing the inventory queue.

Scenarios use the launcher's structured local `workflow` protocol, rather than
server chat. The `start`, `pause`, `resume` and `stop` actions are acknowledged
through the normal request channel; progress is included in inventory telemetry.

## Crafting

```
craft stone_pickaxe 1
craft stick 16 inventory
craft torch 64 auto
craft chest 1 table
recipes stone_pickaxe 1
```

`craft item [count=1] [auto|inventory|table]` makes **additional output items**,
rounded up to a recipe batch (e.g. 5 sticks means 8 sticks). The planner uses the
connected server's registry and recipes, recursively makes intermediate items,
reserves shared ingredients, tries alternate recipes, and rejects cycles or
excessively large plans. Preview with `recipes` reports the chosen steps or
missing materials without consuming anything.

`auto` uses the inventory's 2×2 grid where possible. `inventory` rejects recipes
requiring a table. `table` uses the 3×3 table. A table is searched for within 32
blocks. If none is loaded, the bot uses one from inventory or crafts one and
places it on a reachable solid surface next to itself. The placed table remains
in the world. Leave at least one empty inventory slot for results and keep the
crafting grid and cursor empty.

## Smelting and cooking

```
smelt raw_iron 16
smelt beef 8 coal smoker
smelt raw_gold 8 auto blast_furnace
smelt sand 32 charcoal furnace
```

`smelt input [count=1] [fuel=auto] [station=auto]` processes up to one input stack.
Supported recipes include common ores/raw metals, metal equipment recycling,
food, logs into charcoal, glass, stone, bricks, terracotta, cracked and smooth
blocks, dyes, sponge and popped chorus fruit. This is a curated vanilla list;
unlisted/server-custom recipes can be loaded manually with `station`.

Furnaces, blast furnaces and smokers are filtered by recipe compatibility.
The bot approaches a nearby block, requires its three slots to be empty, checks
enough input and one suitable fuel type for the whole batch, loads fuel and
input, waits for actual output, and collects it. Coal, charcoal, coal blocks,
dried kelp blocks, blaze rods, lava buckets, bamboo, sticks and ordinary wooden
planks/logs/wood are supported fuel. Unburned fuel and bucket remainders are
returned when finished. Occupied furnaces are left untouched; use another empty
furnace or open one manually and empty it first.

Stopping, death, disconnect, a closed window, survival actions or a timeout
end the job. Loaded materials remain in the furnace and can be recovered by
opening it again. The bot stays by the furnace until collection completes.

## Workstation operations

The **Блоки вокруг бота** panel scans loaded blocks within a selectable radius
(4–64 blocks, default 32). `station scan 32` does the same from owner commands.
The result lists supported workstations and containers with coordinates and
distance; clicking one approaches that exact block and opens it. This discovery
does not interrupt the bot's current task. Double chests are listed once.

The gathering storage panel has **СКАНИРОВАТЬ И РАСПРЕДЕЛИТЬ**, also available as
`stash scan 32`. This is a cancellable job: it replaces current movement/work,
visits up to 64 nearby chests, barrels and shulker boxes, reads their contents,
and assigns their future deposit purpose. Existing manual groups, disabled
destinations and existing contents are preserved. Ender chests are excluded.

Containers holding valuables, ores/metals, wood, food or bulk items retain that
purpose. Mixed contents produce exact item filters instead of a guessed single
category. Empty boxes reserve a separate destination for valuables when at least
two are available, and the largest share of empty slot capacity for bulk; large
double chests go to bulk first. Additional space is allocated to ores, wood and
food. Repeated scans extend automatic groups without duplicating destinations.

The resulting groups apply to the running bot and are saved in launcher settings.
Inspection does not transfer items. Unreachable containers are shown with an
error and skipped; cancellation keeps the previously configured groups. The UI
shows progress, available slots, assigned purpose and insufficient-space warnings.
`station stop` stops inspection. New filters `#valuable`, `#bulk` and `#food` are
also available for manually configured storage groups.

```
station scan 32
stash scan 32
station open stonecutter
station open 100 64 -20
station put 0 stone 16
station select 0
station take 1
station status
station close
station stop
```

`station open name` finds a loaded block within 32 blocks. Coordinates select a
specific loaded block. The bot approaches a visible reachable face and releases
sneak before opening. The launcher shows its numbered slots and live contents.

- `station put slot item [count=1]`: transfer inventory items into an input slot.
- `station take slot`: return a full block slot/result stack to inventory.
- `station select index`: choose a stonecutter recipe, loom pattern or enchantment.
  Indexes start at 0; enchanting allows 0–2 and checks server offers, XP and lapis.
- `station rename text`: set the name in an open anvil (up to 35 characters).
  Take slot 2 to apply the rename/repair/combine; the server charges XP.
- `station status`: report current work. Live slots are shown in the launcher.
- `station close` / `station stop` / the normal `stop`: cancel and close.

Supported blocks: crafting table, furnace, blast furnace, smoker, anvil variants,
enchanting table, brewing stand, stonecutter, smithing table, grindstone, loom,
cartography table, crafter, chests including ender/trapped chests, barrels,
shulker boxes, hoppers, dispensers and droppers. The UI explains each workstation's
slots. Brewing runs after loading bottles, ingredient and blaze powder; poll the
visible slots and collect after completion. Crafter execution requires redstone.
Smithing, anvil work, grinding and cartography are controlled by their input and
output slots. Server rules, XP, recipes and supported Minecraft versions apply.

Production uses the shared inventory queue. Combat auto-targeting and armour
equipping yield while a production job/window is active. Eating or emergency
rescue cancels production. New movement, combat or gathering jobs stop production
before taking control. Runtime modules and this guide ship with both installed
extensions and the source bundle.
