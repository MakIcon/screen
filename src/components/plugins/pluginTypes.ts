import type { ComponentType, LazyExoticComponent } from "react";
import type { LauncherPluginsSettings, MicrosoftAccount, OptionalExtensionId } from "../../types";

export type PluginId = keyof LauncherPluginsSettings;

export type PluginRenderContext = {
  launcherNickname: string;
  launcherAccountType: string;
  launcherMsAccountId: string | null;
  microsoftAccounts: MicrosoftAccount[];
};

export type PluginSettingsProps = {
  plugins: LauncherPluginsSettings;
  onChange: (plugins: LauncherPluginsSettings) => void;
  context: PluginRenderContext;
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
  optionalExtensionId?: OptionalExtensionId;
  getEnabled: (plugins: LauncherPluginsSettings) => boolean;
  getStatus: (plugins: LauncherPluginsSettings) => string;
  setEnabled: (plugins: LauncherPluginsSettings, enabled: boolean) => LauncherPluginsSettings;
  SettingsComponent: LazyExoticComponent<ComponentType<PluginSettingsProps>>;
};
