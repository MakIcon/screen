import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MinecraftCatalog, MinecraftCatalogEntry } from "../../types";
import { minecraftToken, searchMinecraft, selectMinecraftToken } from "./minecraftSearch";
import "./MinecraftSearchField.css";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  catalog: MinecraftCatalog | null;
  scope: "blocks" | "items";
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
};

export function MinecraftSearchField({
  label,
  value,
  onChange,
  catalog,
  scope,
  multiple = false,
  placeholder,
  disabled = false,
}: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [caret, setCaret] = useState(value.length);
  const [active, setActive] = useState(0);
  const [layout, setLayout] = useState({ top: 0, left: 0, width: 0, height: 300 });
  const query = minecraftToken(value, caret, multiple).query;
  const matches = useMemo(
    () => searchMinecraft(catalog?.entries || [], query, scope),
    [catalog, query, scope],
  );
  const expanded = open && !disabled;
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));

  useLayoutEffect(() => {
    if (!expanded) return;
    const position = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upward = below < 220 && above > below;
      const height = Math.min(350, Math.max(80, upward ? above : below));
      const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 24);
      setLayout({
        top: upward ? rect.top - height - 6 : rect.bottom + 6,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        width,
        height,
      });
    };
    const scrolled = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) position();
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", scrolled, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", scrolled, true);
    };
  }, [expanded]);

  useLayoutEffect(() => {
    if (expanded)
      menuRef.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [expanded, activeIndex]);

  const select = (entry: MinecraftCatalogEntry) => {
    const next = selectMinecraftToken(value, caret, entry.name, multiple);
    onChange(next);
    setCaret(next.length);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="minecraft-search-field">
      <label htmlFor={id}>{label}</label>
      <div className="minecraft-search-input-wrap">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? `${id}-list` : undefined}
          aria-activedescendant={
            expanded && matches.length ? `${id}-option-${activeIndex}` : undefined
          }
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          onFocus={(event) => {
            setCaret(event.currentTarget.selectionStart ?? value.length);
            setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? value.length)}
          onChange={(event) => {
            onChange(event.target.value);
            setCaret(event.target.selectionStart ?? event.target.value.length);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape" && expanded) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive(
                expanded
                  ? Math.max(
                      0,
                      Math.min(
                        matches.length - 1,
                        activeIndex + (event.key === "ArrowDown" ? 1 : -1),
                      ),
                    )
                  : 0,
              );
            }
            if (event.key === "Enter" && expanded && matches.length) {
              event.preventDefault();
              select(matches[activeIndex]);
            }
          }}
        />
        <svg className="minecraft-search-symbol" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="8" cy="8" r="5" />
          <path d="m12 12 5 5" />
        </svg>
      </div>
      {expanded &&
        createPortal(
          <div
            ref={menuRef}
            className="minecraft-search-menu"
            style={{
              top: layout.top,
              left: layout.left,
              width: layout.width,
              maxHeight: layout.height,
            }}
            onPointerDown={(event) => event.preventDefault()}
          >
            <div className="minecraft-search-heading">
              <span>{scope === "blocks" ? "Блоки и группы" : "Предметы"}</span>
              <small>{catalog ? `${matches.length} · ${catalog.version}` : "Каталог"}</small>
            </div>
            <div
              id={`${id}-list`}
              role="listbox"
              aria-label={label}
              className="minecraft-search-results"
            >
              {matches.map((entry, index) => (
                <button
                  key={`${entry.kind}:${entry.name}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  id={`${id}-option-${index}`}
                  aria-selected={index === activeIndex}
                  className="minecraft-search-option"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => select(entry)}
                >
                  <span className="minecraft-search-icon">
                    <img src={entry.texture} alt="" draggable={false} loading="lazy" />
                  </span>
                  <span className="minecraft-search-copy">
                    <strong>{entry.displayName}</strong>
                    <small>{entry.name}</small>
                  </span>
                  <span className="minecraft-search-kind">
                    {entry.kind === "group"
                      ? "Группа"
                      : entry.kind === "block"
                        ? "Блок"
                        : "Предмет"}
                  </span>
                </button>
              ))}
            </div>
            {!matches.length && (
              <p className="minecraft-search-empty" role="status">
                {catalog
                  ? "Ничего не найдено. Попробуйте название или ID Minecraft."
                  : "Каталог пока недоступен. Можно ввести ID Minecraft вручную."}
              </p>
            )}
            {!!matches.length && (
              <div className="minecraft-search-hint">
                ↑ ↓ выбор · Enter подтвердить{multiple ? " · несколько через запятую" : ""}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
