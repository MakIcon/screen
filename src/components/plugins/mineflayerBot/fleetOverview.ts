import type {
  MineflayerBotProfile,
  MineflayerBotStatus,
  MineflayerInventoryItem,
} from "../../../types";

export function fleetOverview(profiles: MineflayerBotProfile[], statuses: MineflayerBotStatus[]) {
  const byId = new Map(statuses.map((status) => [status.botId ?? "default", status]));
  const bots = profiles.map((profile) => {
    const status = byId.get(profile.id);
    const online = Boolean(status?.running && status.state === "connected");
    const workflow = status?.inventory?.workflow;
    const phase = workflow?.phase ?? "idle";
    return {
      profile,
      status,
      online,
      workflow,
      phase,
      completed: workflow?.steps.filter((step) => step.state === "complete").length ?? 0,
    };
  });
  const items = new Map<
    string,
    Pick<MineflayerInventoryItem, "name" | "displayName" | "texture" | "count"> & { bots: number }
  >();
  for (const bot of bots) {
    if (!bot.online) continue;
    const seen = new Set<string>();
    for (const item of bot.status?.inventory?.slots ?? []) {
      if (!item || item.count <= 0) continue;
      const total = items.get(item.name) ?? {
        name: item.name,
        displayName: item.displayName,
        texture: item.texture,
        count: 0,
        bots: 0,
      };
      total.count += item.count;
      if (!seen.has(item.name)) total.bots++;
      seen.add(item.name);
      items.set(item.name, total);
    }
  }
  return {
    bots,
    items: [...items.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    online: bots.filter((bot) => bot.online).length,
    complete: bots.filter((bot) => bot.phase === "complete").length,
    running: bots.filter(
      (bot) => bot.online && ["starting", "running", "pausing", "stopping"].includes(bot.phase),
    ).length,
    errors: bots.filter((bot) => bot.phase === "error").length,
    reporting: bots.filter((bot) => bot.online && bot.status?.inventory).length,
  };
}
