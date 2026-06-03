import type { PluginDefinition } from "./pluginTypes";

type PluginIconProps = {
  definition: PluginDefinition;
  className: string;
};

export function PluginIcon({ definition, className }: PluginIconProps) {
  if (definition.icon) {
    return (
      <span className={`${className} plugin-icon`} aria-hidden="true">
        <img src={definition.icon.src} alt="" draggable={false} />
      </span>
    );
  }

  return (
    <span className={className} aria-hidden="true">
      {definition.mark ?? "EXT"}
    </span>
  );
}
