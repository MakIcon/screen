import { useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { MineflayerFleetControl } from "../../../src/components/plugins/mineflayerBot/MineflayerFleetControl";
import { botConfiguration } from "../../../src/components/plugins/mineflayerBot/botFleet";
import { normalizeMineflayerBotSettings } from "../../../src/components/plugins/pluginSettings";
import type { MineflayerBotStatus } from "../../../src/types";
import { saveLocale } from "../../../src/i18n/store";
import "../../../src/App.css";
import "../../../src/components/plugins/LauncherPluginsModal.css";
import "../../../src/components/plugins/mineflayerBot/MineflayerBotPlugin.css";

const qa = {
  calls: [] as Array<{ command: string; args: Record<string, unknown> }>,
  failBotId: "",
  slow: false,
  release: () => {},
  setLocale: saveLocale,
};
Object.assign(window, { fleetQA: qa });
mockIPC(async (command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  qa.calls.push({ command, args });
  if (args.botId === qa.failBotId) throw new Error("Fixture: bot unavailable");
  if (qa.slow && command === "configure_mineflayer_bot_storage") {
    qa.slow = false;
    await new Promise<void>((resolve) => {
      qa.release = resolve;
    });
  }
});
const profiles = [
  ["default", "Miner_1"],
  ["miner-2", "Miner_2"],
  ["farmer", "Farmer"],
  ["offline", "Sleeper"],
].map(([id, botNickname]) => ({
  id,
  settings: botConfiguration(normalizeMineflayerBotSettings({ botNickname })),
}));
const statuses: MineflayerBotStatus[] = profiles.map((bot) => ({
  botId: bot.id,
  revision: 1,
  running: bot.id !== "offline",
  state: bot.id === "offline" ? "stopped" : "connected",
  logs: [],
}));

function Fixture() {
  const [activeId, setActiveId] = useState("default");
  return (
    <main
      className="launcher-plugins-dialog"
      style={{ maxWidth: 1080, margin: "0 auto", padding: 24 }}
    >
      <section className="mf-fleet-panel">
        <MineflayerFleetControl
          profiles={profiles}
          statuses={statuses}
          activeId={activeId}
          onInspect={setActiveId}
          nameFor={(bot) => bot.settings.botNickname}
          refresh={async () => null}
          disabled={false}
        />
      </section>
      <output id="inspected">{activeId}</output>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
