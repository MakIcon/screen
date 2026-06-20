import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

interface MenuLayout {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
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
}: InlineDropdownProps) {
  const [irisMap, setIrisMap] = useState<Map<string, boolean>>(new Map());
  const [menuDirection, setMenuDirection] = useState<"down" | "up">("down");
  const [menuLayout, setMenuLayout] = useState<MenuLayout | null>(null);
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

    const updateMenuLayout = () => {
      const root = rootRef.current;
      if (!root) return;

      const rect = root.getBoundingClientRect();
      const estimatedMenuHeight = Math.min(Math.max(options.length, 1) * 49 + 2, 240);
      const gap = 2;
      const viewportPadding = 8;
      const spaceBelow = window.innerHeight - viewportPadding - rect.bottom;
      const spaceAbove = rect.top - viewportPadding;

      const shouldOpenUp =
        spaceBelow < estimatedMenuHeight + gap &&
        spaceAbove > spaceBelow;

      const direction = shouldOpenUp ? "up" : "down";
      const availableHeight = Math.max(0, (shouldOpenUp ? spaceAbove : spaceBelow) - gap);
      const maxHeight = Math.min(estimatedMenuHeight, availableHeight);
      const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
      const left = Math.min(
        Math.max(rect.left, viewportPadding),
        window.innerWidth - viewportPadding - width,
      );
      const top = shouldOpenUp
        ? Math.max(viewportPadding, rect.top - gap - maxHeight)
        : rect.bottom + gap;

      setMenuDirection(direction);
      setMenuLayout({ top, left, width, maxHeight });
    };

    updateMenuLayout();
    window.addEventListener("resize", updateMenuLayout);
    window.addEventListener("scroll", updateMenuLayout, true);

    return () => {
      window.removeEventListener("resize", updateMenuLayout);
      window.removeEventListener("scroll", updateMenuLayout, true);
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

      {isOpen && menuLayout && createPortal(
        <div
          className={`inline-dropdown-menu inline-dropdown-menu-portal ${menuDirection === "up" ? "inline-dropdown-menu-up" : ""}`}
          style={{
            top: menuLayout.top,
            left: menuLayout.left,
            width: menuLayout.width,
          }}
        >
          <CustomScrollArea
            onWheel={(e) => e.stopPropagation()}
            style={{ maxHeight: menuLayout.maxHeight }}
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
        </div>,
        document.body,
      )}
    </div>
  );
}
