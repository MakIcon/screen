# Auto-eat and emergency MLG

## Combat potions (1.16.0)

Configure **Выживание → Автобафы и лечебные зелья** and restart the bot.
AutoBuff, healing potions and combat buffs are enabled by default; the healing
threshold is 12 HP. The separate **Лечение в бою** combat preference controls
healing supplies. Adaptive combat creates space for healing; non-adaptive combat
can use potions when a safe window already exists.

Healing selects instant health or regeneration from inventory. Instant health
has priority, stronger healing and splash delivery are preferred. Active
regeneration is not wasted. Before fighting at distance, strength, speed and
fire resistance can be applied if absent or weaker than the carried potion.
Buff preparation starts at eight blocks and is cancelled if the enemy closes
inside 4.5 blocks. Bottles stay in inventory; lingering potions and potions with
harmful or unknown effects are preserved.

Recognition supports legacy 1.8 metadata, NBT Potion/CustomPotionEffects and
modern numeric potion_contents/custom effect components, including long/strong
variants. Effect IDs are resolved using the connected version's registry.
Splash potions are aimed straight down, with a real look packet before use,
only while grounded and with no other player or mob within 4.5 blocks. A throw
alone is not success: the controller waits for a self effect or healing update.
Drinking waits for the server's consumption status, including at full hunger.
Timeouts back off instead of retrying each tick.

Potion use shares the inventory queue and survival ownership with food, shield
defense, combat and MLG. MLG cancels drinking immediately; a cancelled potion
cannot restore a sword over the emergency bucket. Success restores the previous
weapon and resumes the same combat target. Stop, target change, death and
disconnect cancel pending work and remove acknowledgement listeners.

## Food and water rescue

Added in Mineflayer Bot 1.8.13.

Configure these features in the bot's **Выживание** tab and restart the bot.
Both are enabled by default. Settings are saved in `survival` separately from
planned Water Drop permissions and combat settings.

Auto-eat starts at hunger <=15 or health <=14, provided hunger is below 20.
It chooses safe food in one inventory pass, pauses navigation/combat, waits for
the server's consumption acknowledgement and restores the previous held item.
Dangerous food, suspicious stew, raw chicken, chorus fruit and golden apples
are excluded. Empty inventory and failed consumption attempts are rate limited.
Listeners and timeouts are removed on success, failure, death and disconnect.

The local CommonJS module adapts linkle69/mineflayer-auto-eat 5.0.3 (MIT).
The supplied nxg-org 2.4.1 snapshot has primitive-selection and item-update
signature bugs. The newer snapshot fixes these, but still leaves listeners on
timeouts and can leave `isEating` set after equip failure. The local module
fixes those lifecycle issues and coordinates ownership with the launcher's
combat and movement controllers. No additional npm dependency is required.
Original attribution and permission text are in AUTO-EAT-LICENSE.

Emergency MLG handles accidental falls, including knockback, from >=4 blocks.
It predicts the first collision using Mineflayer/Prismarine physics and checks
the bucket trajectory with the same steering and raycast rules as planned
Water Drop. It only targets loaded, full block supports with empty space above,
requires a water bucket and refuses ultrawarm/Nether dimensions. Existing water
landings do not spend a bucket. Creative, spectator, climbing and elytra flight
do not trigger rescue. Planned Water Drop retains its own executor.

MLG cancels eating immediately, takes priority over combat/pearls, equips water,
sends the aimed look before use_item, confirms the source and empty bucket,
then recovers only that source after a stable, grounded landing. It restores
the previous hand and resumes the travel/combat target. Pickup can be disabled.
No successful clutch is guaranteed under server lag, protected blocks or
inventory/range changes; the controller reports missing server confirmations.
