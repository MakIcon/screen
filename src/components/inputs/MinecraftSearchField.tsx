import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MinecraftCatalog, MinecraftCatalogEntry } from "../../types";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import {
  minecraftToken,
  searchMinecraft,
  minecraftResultSections,
  minecraftSelectedNames,
  selectMinecraftEntries,
  type MinecraftSearchSection,
} from "./minecraftSearch";
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
  sections?: MinecraftSearchSection[];
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
  sections,
}: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [caret, setCaret] = useState(value.length);
  const [active, setActive] = useState(0);
  const anchorRef = useRef<string | null>(null);
  const [selectionQuery, setSelectionQuery] = useState<string | null>(null);
  const [layout, setLayout] = useState({ top: 0, left: 0, width: 0, height: 300 });
  const query = selectionQuery ?? minecraftToken(value, caret, multiple).query;
  const groups = useMemo(
    () => minecraftResultSections(searchMinecraft(catalog?.entries || [], query, scope), sections),
    [catalog, query, scope, sections],
  );
  const matches = useMemo(() => groups.flatMap((group) => group.entries), [groups]);
  const selected = new Set(minecraftSelectedNames(value));
  const expanded = open && !disabled;
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));

  useLayoutEffect(() => {
    if (pendingCaretRef.current === null) return;
    const position = pendingCaretRef.current;
    pendingCaretRef.current = null;
    inputRef.current?.setSelectionRange(position, position);
  }, [value]);

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
      menuRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [expanded, activeIndex, matches]);

  const select = (
    entry: MinecraftCatalogEntry,
    modifiers: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  ) => {
    const additive = modifiers.ctrlKey || modifiers.metaKey;
    const extended = multiple && (additive || modifiers.shiftKey);
    const index = matches.indexOf(entry);
    const anchor = matches.findIndex(
      (option) => `${option.kind}:${option.name}` === anchorRef.current,
    );
    const names =
      multiple && modifiers.shiftKey
        ? matches
            .slice(
              Math.min(anchor < 0 ? index : anchor, index),
              Math.max(anchor < 0 ? index : anchor, index) + 1,
            )
            .map((option) => option.name)
        : [entry.name];
    const next = selectMinecraftEntries(
      value,
      caret,
      names,
      !extended ? "single" : modifiers.shiftKey ? (additive ? "add" : "range") : "toggle",
      new Set((catalog?.entries || []).map((option) => option.name)),
    );
    onChange(next);
    pendingCaretRef.current = next === value ? null : next.length;
    if (next === value) inputRef.current?.setSelectionRange(next.length, next.length);
    setCaret(next.length);
    if (!modifiers.shiftKey || anchor < 0) anchorRef.current = `${entry.kind}:${entry.name}`;
    setActive(index);
    setSelectionQuery(extended ? query : null);
    setOpen(extended);
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
            setSelectionQuery(null);
          }}
          onBlur={() => {
            setOpen(false);
            setSelectionQuery(null);
          }}
          onClick={() => {
            setOpen(true);
            setSelectionQuery(null);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? value.length)}
          onChange={(event) => {
            onChange(event.target.value);
            setCaret(event.target.selectionStart ?? event.target.value.length);
            setActive(0);
            anchorRef.current = null;
            setSelectionQuery(null);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape" && expanded) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              setSelectionQuery(null);
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              const nextIndex = expanded
                ? Math.max(
                    0,
                    Math.min(
                      matches.length - 1,
                      activeIndex + (event.key === "ArrowDown" ? 1 : -1),
                    ),
                  )
                : 0;
              if (multiple && event.shiftKey && matches[nextIndex]) {
                if (!anchorRef.current && matches[activeIndex])
                  anchorRef.current = `${matches[activeIndex].kind}:${matches[activeIndex].name}`;
                select(matches[nextIndex], event);
              } else setActive(nextIndex);
            }
            if (event.key === "Enter" && expanded && matches.length) {
              event.preventDefault();
              select(matches[activeIndex], event);
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
            <CustomScrollArea className="minecraft-search-scroll">
              <div
                id={`${id}-list`}
                role="listbox"
                aria-multiselectable={multiple || undefined}
                aria-label={label}
                className="minecraft-search-results"
              >
                {groups.map((group) => (
                  <div key={group.id} role="group" aria-label={group.label}>
                    <div className="minecraft-search-section" aria-hidden="true">
                      <span>{group.label}</span>
                      <small>{group.entries.length}</small>
                    </div>
                    {group.entries.map((entry) => {
                      const index = matches.indexOf(entry);
                      const chosen = selected.has(entry.name);
                      const [title, legacyDescription] = entry.displayName.split(" · ");
                      return (
                        <button
                          key={`${entry.kind}:${entry.name}`}
                          type="button"
                          role="option"
                          tabIndex={-1}
                          id={`${id}-option-${index}`}
                          aria-selected={chosen}
                          data-active={index === activeIndex}
                          className={`minecraft-search-option${entry.kind === "group" ? " is-group" : ""}`}
                          onMouseEnter={() => setActive(index)}
                          onClick={(event) => select(entry, event)}
                        >
                          <span className="minecraft-search-icon">
                            <img src={entry.texture} alt="" draggable={false} loading="lazy" />
                          </span>
                          <span className="minecraft-search-copy">
                            <strong>{title}</strong>
                            {(entry.description || legacyDescription) && (
                              <span className="minecraft-search-description">
                                {entry.description || legacyDescription}
                              </span>
                            )}
                            <small>{entry.name}</small>
                          </span>
                          <span className="minecraft-search-kind">
                            {entry.kind === "group"
                              ? entry.blocks
                                ? `${entry.blocks.length} блоков`
                                : "Группа"
                              : entry.kind === "block"
                                ? "Блок"
                                : "Предмет"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              {!matches.length && (
                <p className="minecraft-search-empty" role="status">
                  {catalog
                    ? "Ничего не найдено. Попробуйте название или ID Minecraft."
                    : "Каталог пока недоступен. Можно ввести ID Minecraft вручную."}
                </p>
              )}
            </CustomScrollArea>
            {!!matches.length && (
              <div className="minecraft-search-hint">
                ↑ ↓ выбор · Enter подтвердить
                {multiple ? " · Ctrl — добавить/снять · Shift — диапазон" : ""}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
