import type { MineflayerBotProfile, MineflayerBotStatus } from "../../../types";
import { DEFAULT_BOT_ID } from "./botFleet";

export type FleetScope = "active" | "selected" | "all";
export type FleetTask = "mine" | "forest" | "farm" | "collect" | "craft" | "smelt" | "goto";
export type FleetRequest = { command: string; args: Record<string, unknown> };
export type FleetReceipt = {
  botId: string;
  name: string;
  state: "accepted" | "error" | "cancelled";
  error?: string;
};
export type FleetGroup = { id: string; name: string; botIds: string[] };

export function fleetRecipients(
  profiles: MineflayerBotProfile[],
  statuses: MineflayerBotStatus[],
  scope: FleetScope,
  activeId: string,
  selectedIds: string[],
) {
  const online = new Set(
    statuses
      .filter((bot) => bot.running && bot.state === "connected")
      .map((bot) => bot.botId ?? DEFAULT_BOT_ID),
  );
  return profiles.filter((bot) =>
    scope === "all"
      ? online.has(bot.id)
      : scope === "active"
        ? bot.id === activeId
        : selectedIds.includes(bot.id),
  );
}

/** A total smaller than the group assigns work only to the first N bots. */
export function fleetTaskCounts(count: number, recipients: number, split: boolean): number[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000000 || recipients < 1) return [];
  return Array.from({ length: recipients }, (_, index) =>
    split ? Math.floor(count / recipients) + (index < count % recipients ? 1 : 0) : count,
  );
}

export function fleetTaskCommand(
  task: FleetTask,
  item: string,
  count: number,
  radius: number,
  coordinates: string,
): string | null {
  if (task === "goto") {
    const parts = coordinates.trim().split(/\s+/);
    const values = parts.map(Number);
    return parts.length === 3 &&
      values.every(Number.isFinite) &&
      Math.abs(values[0]) <= 30000000 &&
      Math.abs(values[2]) <= 30000000 &&
      values[1] >= -2048 &&
      values[1] <= 2048
      ? `goto ${values.join(" ")}`
      : null;
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000000) return null;
  if (!Number.isSafeInteger(radius) || radius < 1 || radius > 64) return null;
  const name = item.trim().replace(/^minecraft:/, "");
  if (!["forest", "collect"].includes(task) && !/^[a-z0-9_]+$/.test(name)) return null;
  if (task === "forest") return `forest ${radius} ${count} logs scaffold`;
  if (task === "collect") return `collect ${radius}`;
  if (task === "mine" || task === "farm") return `${task} ${name} ${count} ${radius}`;
  return `${task} ${name} ${count} auto`;
}

export function parseFleetGroups(raw: string | null): FleetGroup[] {
  try {
    const groups: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(groups)) return [];
    return groups
      .filter(
        (group): group is FleetGroup =>
          group &&
          typeof group.id === "string" &&
          typeof group.name === "string" &&
          group.name.trim().length > 0 &&
          group.name.length <= 40 &&
          Array.isArray(group.botIds) &&
          group.botIds.length <= 100 &&
          group.botIds.every((id: unknown) => typeof id === "string"),
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}

/** Keep requests for one bot ordered; other bots proceed independently. */
export async function dispatchFleetRequests(
  jobs: Array<{ botId: string; name: string; requests: FleetRequest[]; offline?: boolean }>,
  invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>,
  options: {
    cancelled: () => boolean;
    offlineMessage: string;
    errorMessage: (cause: unknown) => string;
    onReceipt: (receipt: FleetReceipt) => void;
  },
) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        let receipt: FleetReceipt = { botId: job.botId, name: job.name, state: "accepted" };
        try {
          if (options.cancelled()) receipt.state = "cancelled";
          else if (job.offline) throw new Error(options.offlineMessage);
          else
            for (const request of job.requests) {
              if (options.cancelled()) {
                receipt.state = "cancelled";
                break;
              }
              await invoke(request.command, { ...request.args, botId: job.botId });
            }
        } catch (cause) {
          receipt = { ...receipt, state: "error", error: options.errorMessage(cause) };
        }
        options.onReceipt(receipt);
      }
    }),
  );
}
