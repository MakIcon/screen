import { useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { MineflayerBotSettings } from "../../../src/components/plugins/mineflayerBot/MineflayerBotPlugin";
import { RuntimeMonitorScope } from "../../../src/hooks/useRuntimeMonitor";
import {
  DEFAULT_BLUE_MAP_SETTINGS,
  DEFAULT_DISCORD_RPC_SETTINGS,
  DEFAULT_OBS_TELEMETRY_SETTINGS,
  DEFAULT_PROXY_SETTINGS,
  normalizeMineflayerBotSettings,
} from "../../../src/components/plugins/pluginSettings";
import type {
  MineflayerBotStatus,
  MineflayerInventory,
  MineflayerWorkflowStatus,
  RuntimeMonitorSnapshot,
  MineflayerStorageGroup,
  MineflayerStorageScan,
} from "../../../src/types";
import { mergeScannedStorageGroups } from "../../../src/components/plugins/mineflayerBot/storageGroups";
import { saveLocale } from "../../../src/i18n/store";
import "../../../src/App.css";
import "../../../src/components/plugins/LauncherPluginsModal.css";

const qa = {
  calls: [] as Array<{ command: string; args: Record<string, unknown> }>,
  failBotId: "",
  slow: false,
  release: () => {},
  setLocale: saveLocale,
  workflow: (_id: string, _phase: MineflayerWorkflowStatus["phase"]) => {},
  applyStorage: (_ids: string[], _groups: MineflayerStorageGroup[], _scanToken?: string) => ({
    saved: 0,
    applied: 0,
    offline: 0,
    errors: [] as unknown[],
  }),
  scanStorage: async (_args: Record<string, unknown>): Promise<unknown> => undefined,
};
Object.assign(window, { fleetQA: qa });
mockIPC(async (command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  if (command === "get_minecraft_catalog") return null;
  qa.calls.push({ command, args });
  if (command === "apply_mineflayer_storage")
    return qa.applyStorage(
      args.botIds as string[],
      args.groups as MineflayerStorageGroup[],
      args.scanToken as string | undefined,
    );
  if (command === "scan_mineflayer_storage_near_player") return qa.scanStorage(args);
  if (args.botId === qa.failBotId) throw new Error("Бот временно недоступен");
  if (qa.slow && command === "configure_mineflayer_bot_storage") {
    qa.slow = false;
    await new Promise<void>((resolve) => {
      qa.release = resolve;
    });
  }
});
const extraBots = Array.from(
  {
    length: Math.max(
      0,
      Math.min(
        96,
        Math.floor(Number(new URLSearchParams(window.location.search).get("extraBots")) || 0),
      ),
    ),
  },
  (_, index) => ({ id: `stress-${index}`, settings: { botNickname: `SCREEN_BOT_${index + 5}` } }),
);
const botSettings = normalizeMineflayerBotSettings({
  enabled: true,
  botNickname: "Miner_1",
  bots: [
    {
      id: "miner-2",
      settings: { botNickname: "Miner_2", gathering: { defendMobs: false, tunnelWidth: 3 } },
    },
    { id: "farmer", settings: { botNickname: "Farmer" } },
    { id: "offline", settings: { botNickname: "Sleeper" } },
    ...extraBots,
  ],
});
const interruptedCase =
  new URLSearchParams(window.location.search).get("warehouseCase") === "interrupted";
const interruptedScan: MineflayerStorageScan = {
  id: 1,
  startedAt: Date.now(),
  token: crypto.randomUUID(),
  originMode: "owner",
  phase: "inspecting",
  state: "cancelled",
  saved: false,
  total: 60,
  radius: 24,
  teamSize: 5,
  teamTotal: 60,
  added: 0,
  groups: [],
  warnings: [],
  records: Array.from({ length: 55 }, (_, i) => {
    const position = { x: i % 10, y: 64, z: Math.floor(i / 10) };
    return {
      name: "barrel",
      position,
      positions: [position],
      distance: 5,
      label: "Древесина",
      contents: [{ name: "oak_log", count: 64 }],
      category: "#wood",
      totalSlots: 27,
      freeSlots: 26,
    };
  }),
};
const initialStatuses: MineflayerBotStatus[] = [
  ["default", "Miner_1"],
  ["miner-2", "Miner_2"],
  ["farmer", "Farmer"],
  ["offline", "Sleeper"],
  ...extraBots.map((bot) => [bot.id, bot.settings.botNickname]),
].map(([botId, botUsername]) => ({
  botId,
  botUsername,
  revision: 1,
  running: botId !== "offline",
  state: botId === "offline" ? "stopped" : "connected",
  logs: [],
  inventory: {
    username: botUsername,
    health: 20,
    maxHealth: 20,
    food: 20,
    saturation: 10,
    armor: 0,
    oxygen: null,
    selectedSlot: 0,
    slots: Array(46).fill(null),
    occupied: 0,
    capacity: 36,
    ...(interruptedCase && botId === "miner-2"
      ? {
          production: {
            busy: false,
            phase: "idle",
            message: "Поиск остановлен",
            station: null,
            storageScan: interruptedScan,
          },
        }
      : {}),
  } as MineflayerInventory,
}));

function Fixture() {
  const [plugins, setPlugins] = useState({
    mineflayerBot: botSettings,
    blueMap: DEFAULT_BLUE_MAP_SETTINGS,
    discordRpc: DEFAULT_DISCORD_RPC_SETTINGS,
    obsTelemetry: DEFAULT_OBS_TELEMETRY_SETTINGS,
    proxy: DEFAULT_PROXY_SETTINGS,
  });
  const [statuses, setStatuses] = useState(initialStatuses);
  qa.applyStorage = (ids, draft, scanToken) => {
    const found: MineflayerStorageGroup[] = [0, 32].map((from, index) => ({
      id: `auto-scan-wood-${index}`,
      name: "Древесина",
      enabled: true,
      filters: ["#wood"],
      chests: interruptedScan.records.slice(from, from + 32).map((record) => record.position),
    }));
    const groups =
      scanToken === interruptedScan.token ? mergeScannedStorageGroups(draft, found) : draft;
    // This case intentionally delays the settings event: the response must keep
    // the just-saved list visible even while parent props still contain [].
    if (!interruptedCase)
      setPlugins((previous) => ({
        ...previous,
        mineflayerBot: {
          ...previous.mineflayerBot,
          gathering: ids.includes("default")
            ? { ...previous.mineflayerBot.gathering, storageGroups: groups }
            : previous.mineflayerBot.gathering,
          bots: previous.mineflayerBot.bots.map((bot) =>
            ids.includes(bot.id)
              ? {
                  ...bot,
                  settings: {
                    ...bot.settings,
                    gathering: { ...bot.settings.gathering, storageGroups: groups },
                  },
                }
              : bot,
          ),
        },
      }));
    const applied = ids.filter((id) =>
      statuses.some((bot) => bot.botId === id && bot.state === "connected"),
    ).length;
    return {
      saved: ids.length,
      applied,
      offline: ids.length - applied,
      errors: [],
      groupsByBot: Object.fromEntries(ids.map((id) => [id, groups])),
      ...(scanToken === interruptedScan.token
        ? { scan: { ...interruptedScan, groups: found, added: 55, saved: true } }
        : {}),
    };
  };
  qa.scanStorage = async (args) => {
    const groups: MineflayerStorageGroup[] = [
      {
        id: "auto-scan-wood",
        name: "Древесина",
        enabled: true,
        filters: ["#wood"],
        chests: Array.from({ length: 24 }, (_, i) => ({
          x: 12 + (i % 6) * 2,
          y: 64,
          z: 8 + Math.floor(i / 6) * 2,
        })),
      },
    ];
    const scan = {
      id: Date.now(),
      startedAt: Date.now(),
      originMode: "owner" as const,
      token: args.token as string,
      phase: "approaching" as "approaching" | "inspecting",
      state: "running" as "running" | "complete",
      saved: false,
      radius: args.radius as number,
      total: 0,
      teamSize: 2,
      teamTotal: 24,
      added: 0,
      groups: [] as MineflayerStorageGroup[],
      records: [] as Array<{
        name: string;
        position: { x: number; y: number; z: number };
        positions: Array<{ x: number; y: number; z: number }>;
        label: string;
        distance: number;
        totalSlots: number;
        freeSlots: number;
        contents: Array<{ name: string; count: number }>;
      }>,
      warnings: [] as string[],
    };
    const publish = () =>
      setStatuses((previous) =>
        previous.map((bot) =>
          !["miner-2", "farmer"].includes(bot.botId ?? "default")
            ? bot
            : {
                ...bot,
                inventory: {
                  ...bot.inventory!,
                  production: {
                    busy: scan.state === "running",
                    phase: "scan_storage",
                    message: "Проверка складов",
                    station: null,
                    storageScan: {
                      ...structuredClone(scan),
                      records: scan.records.slice(
                        bot.botId === "miner-2" ? 0 : 12,
                        bot.botId === "miner-2" ? 12 : 24,
                      ),
                    },
                  },
                },
              },
        ),
      );
    publish();
    await new Promise((resolve) => setTimeout(resolve, 500));
    scan.phase = "inspecting";
    scan.total = 12;
    publish();
    await new Promise((resolve) => setTimeout(resolve, 500));
    Object.assign(scan, {
      state: "complete",
      groups,
      added: 24,
      saved: true,
      records: groups[0].chests.map((position) => ({
        name: "chest",
        position,
        positions: [position],
        label: "Древесина",
        distance: 4,
        totalSlots: 27,
        freeSlots: 26,
        contents: [{ name: "oak_log", count: 64 }],
      })),
    });
    publish();
    const ids = args.botIds as string[];
    const current = plugins.mineflayerBot.gathering.storageGroups;
    return {
      botId: "miner-2",
      scan: { ...scan, total: 24 },
      application: qa.applyStorage(ids, mergeScannedStorageGroups(current, groups)),
    };
  };
  qa.workflow = (id, phase) =>
    setStatuses((previous) =>
      previous.map((bot) =>
        bot.botId !== id
          ? bot
          : {
              ...bot,
              inventory: {
                ...bot.inventory!,
                workflow: {
                  phase,
                  message: `${phase} · ${bot.botUsername}`,
                  current: 0,
                  steps: [
                    {
                      kind: "mine",
                      item: "stone",
                      count: 64,
                      radius: 32,
                      state: phase === "complete" ? "complete" : "running",
                    },
                  ],
                },
              },
            },
      ),
    );
  const snapshot = {
    mineflayerBot: statuses[0],
    mineflayerBots: statuses,
    optionalExtensions: [{ id: "mineflayer-bot", installed: true }],
  } as RuntimeMonitorSnapshot;
  return (
    <RuntimeMonitorScope controller={{ snapshot, error: "", refresh: async () => snapshot }}>
      <main
        className="launcher-plugins-dialog"
        style={{ maxWidth: 1320, margin: "0 auto", padding: 24 }}
      >
        <MineflayerBotSettings
          plugins={plugins}
          onChange={setPlugins}
          context={{
            launcherNickname: "Owner",
            launcherAccountType: "OFFLINE",
            launcherMsAccountId: null,
            microsoftAccounts: [],
          }}
        />
      </main>
    </RuntimeMonitorScope>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
