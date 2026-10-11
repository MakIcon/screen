# Auto-eat and emergency MLG

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
