import type {
  MineflayerBotConfiguration,
  MineflayerBotPluginSettings,
  MineflayerBotProfile,
  MineflayerBotStatus,
} from "../../../types";

export const DEFAULT_BOT_ID = "default";
export const BOT_LIMIT = 100;

export function chaoticMovementTargets(statuses: MineflayerBotStatus[], enabled: boolean) {
  return statuses.filter(
    (status) =>
      status.running &&
      status.state === "connected" &&
      (enabled || status.inventory?.chaoticMovement),
  );
}

export function botConfiguration(
  settings: MineflayerBotPluginSettings,
): MineflayerBotConfiguration {
  const { bots: _bots, ...configuration } = settings;
  return configuration;
}

export function nextBotNicknames(
  settings: MineflayerBotPluginSettings,
  count: number,
  prefix: string,
): string[] {
  const names = new Set(
    [settings.botNickname, ...settings.bots.map((bot) => bot.settings.botNickname)].map((name) =>
      name.toLowerCase(),
    ),
  );
  const base = prefix.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 11) || "SCREEN_BOT";
  const nicknames: string[] = [];
  let index = 1;
  const total = Math.min(Math.max(1, Math.floor(count) || 1), BOT_LIMIT - 1 - settings.bots.length);
  while (nicknames.length < total) {
    const nickname = `${base}_${index++}`;
    if (names.has(nickname.toLowerCase())) continue;
    names.add(nickname.toLowerCase());
    nicknames.push(nickname);
  }
  return nicknames;
}

export function createBotProfiles(
  settings: MineflayerBotPluginSettings,
  template: MineflayerBotConfiguration,
  count: number,
  prefix: string,
): MineflayerBotProfile[] {
  return nextBotNicknames(settings, count, prefix).map((nickname) => ({
    id: crypto.randomUUID(),
    settings: {
      ...structuredClone(template),
      botNickname: nickname,
      botAccountMode: "offline",
      botMicrosoftAccountId: null,
    },
  }));
}
