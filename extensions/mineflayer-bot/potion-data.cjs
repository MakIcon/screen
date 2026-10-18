// Potion recognition informed by nxg-org/mineflayer-auto-buff 1.5.0
// (GenerelSchwerz, GPL-3.0). See THIRD-PARTY-NOTICES.md.
const nbt = require("prismarine-nbt");

// Vanilla's built-in potion registry order, used by the numeric potion_contents
// component since 1.20.5. Effect IDs, unlike potion IDs, come from the live registry.
const POTIONS = [
  "water", "mundane", "thick", "awkward", "night_vision", "long_night_vision",
  "invisibility", "long_invisibility", "leaping", "long_leaping", "strong_leaping",
  "fire_resistance", "long_fire_resistance", "swiftness", "long_swiftness", "strong_swiftness",
  "slowness", "long_slowness", "strong_slowness", "turtle_master", "long_turtle_master",
  "strong_turtle_master", "water_breathing", "long_water_breathing", "healing", "strong_healing",
  "harming", "strong_harming", "poison", "long_poison", "strong_poison", "regeneration",
  "long_regeneration", "strong_regeneration", "strength", "long_strength", "strong_strength",
  "weakness", "long_weakness", "luck", "slow_falling", "long_slow_falling",
  "wind_charged", "weaving", "oozing", "infested",
];
const SAFE = new Set([
  "instant_health", "regeneration", "strength", "speed", "fire_resistance",
  "water_breathing", "night_vision", "invisibility", "jump_boost", "slow_falling",
  "absorption", "resistance", "health_boost", "saturation", "luck",
]);
const LEGACY = { 1: "regeneration", 2: "swiftness", 3: "fire_resistance", 4: "poison",
  5: "healing", 6: "night_vision", 8: "weakness", 9: "strength", 10: "slowness",
  11: "leaping", 12: "harming", 13: "water_breathing", 14: "invisibility" };
const key = (value) => typeof value === "string"
  ? value.replace(/^minecraft:/, "").replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase()
  : "";

function effectName(bot, id) {
  return typeof id === "number" ? key(bot.registry?.effects?.[id]?.name) : key(id);
}
function activeEffect(bot, name, amplifier = 0) {
  return Object.values(bot.entity?.effects ?? {}).some((effect) =>
    effectName(bot, effect.id) === name && effect.amplifier >= amplifier);
}
function potionData(bot, item) {
  if (!item || !/^(potion|splash_potion|lingering_potion)$/.test(item.name)) return null;
  let data, tag = {};
  try { if (item.nbt) tag = nbt.simplify(item.nbt); } catch { return null; }
  const component = item.componentMap?.get("potion_contents") ??
    item.componentMap?.get("minecraft:potion_contents") ??
    item.components?.find((entry) => /^(minecraft:)?potion_contents$/.test(entry.type));
  if (component) data = component.data ?? component.value ?? component;
  let potion = data ? data.potion ?? data.potionId : tag.Potion;
  if (typeof potion === "number") potion = POTIONS[potion];
  let name = key(potion);
  const legacy = bot.registry?.isOlderThan?.("1.9") ??
    (bot.registry?.isNewerOrEqualTo ? !bot.registry.isNewerOrEqualTo("1.9") : false);
  if (!data && !name && legacy) {
    name = LEGACY[(item.metadata ?? 0) & 15] ?? "";
    if (name) name = `${item.metadata & 32 ? "strong_" : item.metadata & 64 ? "long_" : ""}${name}`;
  }
  const amplifier = name.startsWith("strong_") ? 1 : 0;
  const base = name.replace(/^(long_|strong_)/, "");
  const aliases = { healing: "instant_health", swiftness: "speed", leaping: "jump_boost", harming: "instant_damage" };
  const effects = [];
  if (base && !["water", "awkward", "mundane", "thick"].includes(base))
    effects.push({ name: aliases[base] ?? base, amplifier });
  // Unknown component IDs must never silently fall back to unrelated legacy NBT.
  if (data && (data.potionId != null || data.potion != null) && !name) return null;
  for (const effect of data?.customEffects ?? tag.CustomPotionEffects ?? tag.custom_potion_effects ?? []) {
    const details = effect.details ?? effect;
    const effectKey = effectName(bot, effect.id ?? effect.Id);
    const level = details.amplifier ?? details.Amplifier ?? 0;
    if (!effectKey || !Number.isInteger(level) || level < 0) return null;
    effects.push({ name: effectKey, amplifier: Math.min(level, 255) });
  }
  if (!effects.length || effects.some((effect) => !SAFE.has(effect.name))) return null;
  return {
    name, effects,
    splash: item.name === "splash_potion" || (legacy && Boolean(item.metadata & 0x4000)),
    lingering: item.name === "lingering_potion",
  };
}

module.exports = { potionData, activeEffect, effectName };
