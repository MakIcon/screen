# Farming

Use the **Вспашка**, **Посадка**, **Урожай** and **Огород** actions in the gathering panel or add them to a workflow. Commands use the configured owner-command prefix (normally `!`):

```text
!till 0 8
!plant wheat 0 8
!harvest auto 0 8 replant
!harvest potato 16 8 leave
!farm auto 0 8
```

Arguments are crop (except `till`), action count (`0` means all available), radius. Defaults: automatic crop selection, all available, radius 8. `harvest` accepts `replant` (default) or `leave`. `work pause`, `work resume`, `work stop`, queue controls and delivery also apply to farming.

Supported crops: `wheat`, `beetroot`, `carrot`, `potato`, `pumpkin`, `melon`, `nether_wart`. Seed item IDs and crop block IDs are accepted as aliases. `auto`/`all` harvest every supported mature crop and plant available seeds. Version availability is checked before starting.

Put a hoe with remaining durability and planting items in the bot's inventory. The bot tills dirt, grass blocks and dirt paths with clear air above, within four blocks horizontally of water (at soil level or one above). It plants on empty farmland; nether wart requires soul sand. Existing plants, including immature crops and pumpkin/melon stems, are preserved. Pumpkin/melon fruit must have an adjacent matching stem, protecting decorative pumpkins. New stems require a free neighboring fruit bed; planting leaves the empty cells beside existing stems free for fruit.

Each task makes one bounded pass through loaded terrain. Plants grow naturally under Minecraft's usual conditions; run harvesting again once they mature. `farm` prioritizes harvest, replanting and empty beds before preparing more soil. Each harvest, till or initial planting counts as one action; replacement planting does not consume the action limit. A harvested position is collected at most once per task.

Drops are collected before replanting, including seeds from the harvest. Missing tools, seeds or inventory space pause the task with a reason; supply them and resume. Farm storage unloading retains planting items and tools. The bot walks directly across farmland and planted beds, accounting for their 15/16-block height. Farming uses grounded walking only: no jumps, parkour, falls, climbing or swimming, and no digging or building through the field. Routes needing these movements require a walkable approach instead. Ordinary movement settings return when farming stops or pauses. The bot checks reach/visibility, rereads blocks before acting and waits for the server to confirm changes. Pause, cancellation and survival actions retain the existing gathering controller's ownership rules.
