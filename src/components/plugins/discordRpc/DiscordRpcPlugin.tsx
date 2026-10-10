import type { DiscordRpcPluginSettings } from "../../../types";
import type { PluginSettingsProps } from "../pluginTypes";
import { PluginSettingsGroup } from "../PluginSettingsGroup";
import { PlaceholderGuideButton } from "../../placeholders/PlaceholderGuideButton";
import "./DiscordRpcPlugin.css";

type DiscordRpcDisplayMode = DiscordRpcPluginSettings["displayMode"];

const DISCORD_RPC_DISPLAY_MODES: {
  id: DiscordRpcDisplayMode;
  label: string;
}[] = [
  { id: "minecraft", label: "Minecraft" },
  { id: "launcher", label: "Лаунчер" },
  { id: "combined", label: "Игра и лаунчер" },
];

function DiscordRpcSettingsEditor({
  settings,
  onChange,
}: {
  settings: DiscordRpcPluginSettings;
  onChange: (settings: DiscordRpcPluginSettings) => void;
}) {
  const update = (patch: Partial<DiscordRpcPluginSettings>) => {
    onChange({ ...settings, ...patch });
  };

  const modeTemplates =
    settings.displayMode === "launcher"
      ? {
          detailsKey: "launcherDetailsTemplate" as const,
          stateKey: "launcherStateTemplate" as const,
          detailsPlaceholder: "In ScreenLauncher",
          statePlaceholder: "Managing %total_builds% builds",
        }
      : settings.displayMode === "combined"
        ? {
            detailsKey: "combinedDetailsTemplate" as const,
            stateKey: "combinedStateTemplate" as const,
            detailsPlaceholder: "Playing %build_name%",
            statePlaceholder: "%build_version% / %build_loader% via ScreenLauncher",
          }
        : {
            detailsKey: "detailsTemplate" as const,
            stateKey: "stateTemplate" as const,
            detailsPlaceholder: "Playing %build_name%",
            statePlaceholder: "%build_version% / %build_loader% via ScreenLauncher",
          };

  return (
    <div className="discord-rpc-editor">
      <PluginSettingsGroup
        title="ПОДКЛЮЧЕНИЕ К DISCORD"
        description="Приложение Discord и режим отображения"
        collapsible={false}
      >
        <div className="drpc-config">
          <label className="drpc-config-field drpc-config-field--app">
            <span>APPLICATION ID</span>
            <input
              value={settings.applicationId}
              placeholder="ID приложения Discord"
              spellCheck={false}
              onChange={(event) => update({ applicationId: event.target.value })}
            />
          </label>
          <div className="drpc-config-field drpc-config-field--grow">
            <span>ЧТО ПОКАЗЫВАТЬ В ПРОФИЛЕ</span>
            <div
              className="discord-rpc-segmented-control"
              role="group"
              aria-label="Режим отображения"
            >
              {DISCORD_RPC_DISPLAY_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={settings.displayMode === mode.id}
                  className={settings.displayMode === mode.id ? "active" : ""}
                  onClick={() => update({ displayMode: mode.id })}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PluginSettingsGroup>
      <PluginSettingsGroup
        title="ТЕКСТ СТАТУСА"
        description="Название активности и две строки в профиле"
        collapsible={false}
      >
        <label className="drpc-config-field">
          <span>НАЗВАНИЕ АКТИВНОСТИ</span>
          <input
            value={settings.activityNameTemplate}
            placeholder="ScreenLauncher"
            onChange={(event) => update({ activityNameTemplate: event.target.value })}
          />
        </label>
        <label className="drpc-config-field">
          <span>ОСНОВНАЯ СТРОКА</span>
          <input
            value={settings[modeTemplates.detailsKey]}
            placeholder={modeTemplates.detailsPlaceholder}
            onChange={(event) => update({ [modeTemplates.detailsKey]: event.target.value })}
          />
        </label>
        <label className="drpc-config-field">
          <span>ДОПОЛНИТЕЛЬНАЯ СТРОКА</span>
          <input
            value={settings[modeTemplates.stateKey]}
            placeholder={modeTemplates.statePlaceholder}
            onChange={(event) => update({ [modeTemplates.stateKey]: event.target.value })}
          />
        </label>
        <PlaceholderGuideButton />
        <div className="drpc-card" aria-label="Предпросмотр шаблона статуса">
          <div className="drpc-card-title">ПРЕДПРОСМОТР ШАБЛОНА</div>
          <div className="drpc-line drpc-line--name">
            {settings.activityNameTemplate || "ScreenLauncher"}
          </div>
          <div className="drpc-line drpc-line--details">
            {settings[modeTemplates.detailsKey] || modeTemplates.detailsPlaceholder}
          </div>
          <div className="drpc-line drpc-line--state">
            {settings[modeTemplates.stateKey] || modeTemplates.statePlaceholder}
          </div>
          <span className="drpc-timer is-on">0:00 в игре</span>
        </div>
      </PluginSettingsGroup>
      <PluginSettingsGroup title="ИЗОБРАЖЕНИЯ И КНОПКА" collapsible={false}>
        <div className="plugin-settings-fields">
          <label className="drpc-config-field">
            <span>КЛЮЧ БОЛЬШОГО ИЗОБРАЖЕНИЯ</span>
            <input
              value={settings.largeImageKey}
              placeholder="minecraft"
              onChange={(event) => update({ largeImageKey: event.target.value })}
            />
          </label>
          <label className="drpc-config-field">
            <span>КЛЮЧ МАЛЕНЬКОГО ИЗОБРАЖЕНИЯ</span>
            <input
              value={settings.smallImageKey}
              placeholder="launcher"
              onChange={(event) => update({ smallImageKey: event.target.value })}
            />
          </label>
          <label className="drpc-config-field">
            <span>ТЕКСТ КНОПКИ</span>
            <input
              value={settings.buttonLabel}
              placeholder="Необязательно"
              onChange={(event) => update({ buttonLabel: event.target.value })}
            />
          </label>
          <label className="drpc-config-field">
            <span>ССЫЛКА КНОПКИ</span>
            <input
              value={settings.buttonUrl}
              placeholder="https://example.com"
              onChange={(event) => update({ buttonUrl: event.target.value })}
            />
          </label>
        </div>
        <p className="drpc-hint">
          Укажите названия изображений, загруженных в Discord Developer Portal → Rich Presence → Art
          Assets. Кнопка появится, когда вы зададите её текст.
        </p>
      </PluginSettingsGroup>
    </div>
  );
}

export function DiscordRpcSettings({ plugins, onChange }: PluginSettingsProps) {
  return (
    <DiscordRpcSettingsEditor
      settings={plugins.discordRpc}
      onChange={(discordRpc) => onChange({ ...plugins, discordRpc })}
    />
  );
}
