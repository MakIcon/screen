import type { ComponentProps } from "react";
import { PluginSettingsGroup } from "../PluginSettingsGroup";

export function CombatSettingsGroup({
  disabled = false,
  ...props
}: ComponentProps<typeof PluginSettingsGroup> & { disabled?: boolean }) {
  return (
    <fieldset className="mineflayer-bot-combat-group" disabled={disabled}>
      <PluginSettingsGroup {...props} />
    </fieldset>
  );
}
