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
} from "../../../src/types";
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
};
Object.assign(window, { fleetQA: qa });
mockIPC(async (command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  if (command === "get_minecraft_catalog") return null;
  qa.calls.push({ command, args });
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
