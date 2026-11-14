import type {
  MineflayerBotProfile,
  MineflayerBotStatus,
  MineflayerWorkflowStep,
} from "../../../types";

export type FleetRequest = { command: string; args: Record<string, unknown> };
export type FleetReceipt = {
  botId: string;
  name: string;
  state: "accepted" | "error" | "cancelled";
  error?: string;
};
export type FleetGroup = { id: string; name: string; botIds: string[] };

export const workflowIsRunning = (status?: MineflayerBotStatus) =>
  Boolean(
    status?.running &&
    status.state === "connected" &&
    ["starting", "running", "pausing", "paused", "stopping"].includes(
      status.inventory?.workflow?.phase ?? "",
    ),
  );

export function fleetWorkflowRequests(
  bot: MineflayerBotProfile,
  action: "start" | "pause" | "resume" | "stop",
  steps: MineflayerWorkflowStep[] = [],
  name = "",
): FleetRequest[] {
  const settings = bot.settings.gathering;
  return [
    ...(action === "start"
      ? [
          { command: "configure_mineflayer_bot_storage", args: { groups: settings.storageGroups } },
          {
            command: "send_mineflayer_bot_chat",
            args: {
              command: true,
              message: `work defense ${settings.defendMobs ? "on" : "off"} ${settings.defendPlayers ? "on" : "off"} ${settings.defendArrows ? "on" : "off"}`,
            },
          },
          {
            command: "send_mineflayer_bot_chat",
            args: {
              command: true,
              message: `work tunnels ${settings.tunnelWidth} ${settings.tunnelHeight} ${settings.stairWidth} ${settings.stairHeight} ${settings.placeTorches ? "on" : "off"} ${settings.torchInterval}`,
            },
          },
        ]
      : []),
    {
      command: "control_mineflayer_bot_workflow",
      args: {
        action,
        steps: action === "start" ? steps : null,
        name: action === "start" ? name : null,
      },
    },
  ];
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
