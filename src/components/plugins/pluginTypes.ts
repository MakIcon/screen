import type { ReactNode } from "react";
import type { LauncherPluginsSettings, MicrosoftAccount } from "../../types";

export type PluginId = keyof LauncherPluginsSettings;

export type PluginRenderContext = {
  launcherNickname: string;
  launcherAccountType: string;
  launcherMsAccountId: string | null;
  microsoftAccounts: MicrosoftAccount[];
};

export type PluginDefinition = {
  id: PluginId;
  title: string;
  tag: string;
  mark?: string;
  icon?: {
    src: string;
    alt: string;
  };
  description: string;
  getEnabled: (plugins: LauncherPluginsSettings) => boolean;
  getStatus: (plugins: LauncherPluginsSettings) => string;
  setEnabled: (
    plugins: LauncherPluginsSettings,
    enabled: boolean,
  ) => LauncherPluginsSettings;
  renderSettings: (
    plugins: LauncherPluginsSettings,
    onChange: (plugins: LauncherPluginsSettings) => void,
    context: PluginRenderContext,
  ) => ReactNode;
};
