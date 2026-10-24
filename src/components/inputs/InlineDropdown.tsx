import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InstalledModView } from "../../types";
import { translate } from "../../i18n/locale";
import { SearchableSelect } from "./SearchableSelect";

interface InstanceInfo {
  name: string;
  id: string;
  loader: string;
}

interface InlineDropdownProps {
  label: string;
  value: string;
  options: string[];
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
  instanceInfos?: InstanceInfo[];
  compact?: boolean;
  /** Render the menu next to the trigger instead of portalling it to document.body. */
  inlineMenu?: boolean;
}

function getInstanceBadge(info: InstanceInfo, irisMap: Map<string, boolean>) {
  const loader = info.loader.toLowerCase();

  if (loader === "vanilla") {
    return <span className="pack-badge pack-loader-vanilla">VANILLA</span>;
  }

  if (loader === "fabric") {
    return irisMap.get(info.id) ? (
      <span className="pack-badge pack-source-modrinth">IRIS</span>
    ) : (
      <span className="pack-badge pack-badge-no-iris">{translate("inlineDropdown.noIris")}</span>
    );
  }

  if (loader === "quilt") {
    return <span className="pack-badge pack-loader-quilt">QUILT</span>;
  }

  if (loader === "neoforge") {
    return <span className="pack-badge pack-loader-neoforge">NEOFORGE</span>;
  }

  return null;
}

export function InlineDropdown({
  label,
  value,
  options,
  isOpen,
  onToggle,
  onSelect,
  instanceInfos,
  compact = false,
  inlineMenu = false,
}: InlineDropdownProps) {
  const [irisMap, setIrisMap] = useState<Map<string, boolean>>(new Map());
  useEffect(() => {
    let cancelled = false;
    if (!instanceInfos?.length) return;
    void Promise.all(
      instanceInfos
        .filter((instance) => instance.loader.toLowerCase() === "fabric")
        .map(async (instance) => {
          try {
            const mods = await invoke<InstalledModView[]>("list_installed_mods", {
              instanceId: instance.id,
            });
            return [
              instance.id,
              mods.some(
                (mod) =>
                  mod.title.toLowerCase().includes("iris") ||
                  mod.filename.toLowerCase().includes("iris"),
              ),
            ] as const;
          } catch {
            return [instance.id, false] as const;
          }
        }),
    ).then((entries) => {
      if (!cancelled) setIrisMap(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [instanceInfos]);
  const infoMap = useMemo(
    () => new Map(instanceInfos?.map((instance) => [instance.name, instance]) ?? []),
    [instanceInfos],
  );
  return (
    <SearchableSelect
      label={label}
      value={value}
      options={options}
      open={isOpen}
      onOpenChange={(next) => {
        if (next !== isOpen) onToggle();
      }}
      onChange={onSelect}
      variant={compact ? "compact" : "inline"}
      inlineMenu={inlineMenu}
      renderAdornment={
        instanceInfos
          ? (selected) => {
              const info = infoMap.get(selected);
              return info ? getInstanceBadge(info, irisMap) : null;
            }
          : undefined
      }
    />
  );
}
