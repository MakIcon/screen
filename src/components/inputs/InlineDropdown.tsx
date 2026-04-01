import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./InlineDropdown.css";
import { invoke } from "@tauri-apps/api/core";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { CustomArrow } from "../display/CustomArrow";
import type { InstalledModView } from "../../types";

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
      <span className="pack-badge pack-badge-no-iris">NO IRIS</span>
    );
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
}: InlineDropdownProps) {
  const [irisMap, setIrisMap] = useState<Map<string, boolean>>(new Map());
  const [menuDirection, setMenuDirection] = useState<"down" | "up">("down");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!instanceInfos || instanceInfos.length === 0) return;

    const load = async () => {
      const map = new Map<string, boolean>();
      for (const inst of instanceInfos) {
        if (inst.loader.toLowerCase() === "fabric") {
          try {
            const mods = await invoke<InstalledModView[]>("list_installed_mods", {
              instanceId: inst.id,
            });
            map.set(
              inst.id,
              mods.some(
                (m) =>
                  m.title.toLowerCase().includes("iris") ||
                  m.filename.toLowerCase().includes("iris")
              )
            );
          } catch {
            map.set(inst.id, false);
          }
        }
      }
      setIrisMap(map);
    };

    void load();
  }, [instanceInfos]);

  const infoMap = instanceInfos
    ? Object.fromEntries(instanceInfos.map((i) => [i.name, i]))
    : null;

  const selectedInfo = infoMap?.[value];


  useLayoutEffect(() => {
    if (!isOpen) return;

    const updateMenuDirection = () => {
      const root = rootRef.current;
      if (!root) return;

      const rect = root.getBoundingClientRect();
      const estimatedMenuHeight = Math.min(Math.max(options.length, 1) * 49 + 2, 240);
      const gap = 2;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      const shouldOpenUp =
        spaceBelow < estimatedMenuHeight + gap &&
        spaceAbove > spaceBelow;

      setMenuDirection(shouldOpenUp ? "up" : "down");
    };

    updateMenuDirection();
    window.addEventListener("resize", updateMenuDirection);
    window.addEventListener("scroll", updateMenuDirection, true);

    return () => {
      window.removeEventListener("resize", updateMenuDirection);
      window.removeEventListener("scroll", updateMenuDirection, true);
    };
  }, [isOpen, options.length]);
  return (
    <div
      ref={rootRef}
      className={`inline-dropdown ${isOpen ? "open" : ""} ${menuDirection === "up" ? "inline-dropdown-up" : ""}`}
    >
      <button
        type="button"
        className="inline-dropdown-trigger"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <span className="inline-dropdown-trigger-inner">
          <span className="inline-dropdown-label">{label}</span>
          <span className="inline-dropdown-trigger-row">
            <span className="inline-dropdown-value">{value}</span>
          </span>
        </span>

        {selectedInfo && (
          <span className="inline-dropdown-trigger-badge-abs">
            {getInstanceBadge(selectedInfo, irisMap)}
          </span>
        )}

        <span className="inline-dropdown-chevron-wrap" aria-hidden="true">
          <CustomArrow open={isOpen} />
        </span>
      </button>

      {isOpen && (
        <div
          className={`inline-dropdown-menu ${menuDirection === "up" ? "inline-dropdown-menu-up" : ""}`}
        >
          <CustomScrollArea
            onWheel={(e) => e.stopPropagation()}
            style={{ maxHeight: 240 }}
          >
            <div className="csa-content inline-dropdown-menu-content">
              {options.map((opt) => {
                const info = infoMap?.[opt];
                return (
                  <button
                    key={opt}
                    type="button"
                    className={`inline-dropdown-item ${opt === value ? "selected" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(opt);
                    }}
                  >
                    <span className="inline-dropdown-item-label">{opt}</span>
                    {info && (
                      <span className="inline-dropdown-item-badge">
                        {getInstanceBadge(info, irisMap)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </CustomScrollArea>
        </div>
      )}
    </div>
  );
}
