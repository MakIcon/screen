import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useAppearanceComponentSettings } from "../../appearance/useAppearanceComponentSettings";
import { DROPDOWN_DEFAULTS } from "../../appearance/componentDefaults";
import type { AppearanceDropdownSettings } from "../../appearance/types";
import { useTranslation } from "../../i18n/locale";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { CustomArrow } from "../display/CustomArrow";
import "./InlineDropdown.css";
import "./SearchableSelect.css";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  keywords?: string;
  disabled?: boolean;
  adornment?: ReactNode;
}
export type SearchableSelectProps = {
  label: string;
  options: readonly (string | SelectOption)[];
  value?: string;
  defaultValue?: string;
  onChange: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  /** Screens with required enum values can prohibit clearing a selection. */
  allowEmpty?: boolean;
  placeholder?: string;
  variant?: "inline" | "compact" | "field";
  inlineMenu?: boolean;
  className?: string;
  triggerClassName?: string;
  id?: string;
  settings?: Partial<AppearanceDropdownSettings>;
  renderAdornment?: (value: string) => ReactNode;
};

export function filterSelectOptions(
  options: readonly SelectOption[],
  query: string,
  settings: Pick<AppearanceDropdownSettings, "caseSensitive" | "searchMatch" | "sortMode">,
) {
  const normalize = (value: string) => (settings.caseSensitive ? value : value.toLocaleLowerCase());
  const tokens = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const filtered = options.filter((option) => {
    const words = normalize(
      `${option.label} ${option.value} ${option.keywords ?? ""} ${option.description ?? ""}`,
    );
    return tokens.every((token) =>
      settings.searchMatch === "starts-with"
        ? words.split(/\s+/).some((word) => word.startsWith(token))
        : words.includes(token),
    );
  });
  return settings.sortMode === "source"
    ? filtered
    : [...filtered].sort(
        (a, b) =>
          a.label.localeCompare(b.label, undefined, { numeric: true }) *
          (settings.sortMode === "descending" ? -1 : 1),
      );
}

export function nextSelectIndex(
  options: readonly SelectOption[],
  current: number,
  direction: number,
  wrap: boolean,
) {
  for (let step = 1; step <= options.length; step++) {
    const raw = current + step * direction;
    if (!wrap && (raw < 0 || raw >= options.length)) return current;
    const index = ((raw % options.length) + options.length) % options.length;
    if (!options[index].disabled) return index;
  }
  return -1;
}

function Highlight({
  text,
  query,
  enabled,
  caseSensitive,
}: {
  text: string;
  query: string;
  enabled: boolean;
  caseSensitive: boolean;
}) {
  const token = query.trim();
  const start =
    enabled && token
      ? caseSensitive
        ? text.indexOf(token)
        : text.toLocaleLowerCase().indexOf(token.toLocaleLowerCase())
      : -1;
  return start < 0 ? (
    text
  ) : (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, start + token.length)}</mark>
      {text.slice(start + token.length)}
    </>
  );
}

export function SearchableSelect({
  label,
  options,
  value,
  defaultValue = "",
  onChange,
  open,
  onOpenChange,
  disabled = false,
  allowEmpty = true,
  placeholder,
  variant = "inline",
  inlineMenu = false,
  className = "",
  triggerClassName = "",
  id: suppliedId,
  settings: defaults,
  renderAdornment,
}: SearchableSelectProps) {
  const tr = useTranslation();
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [layout, setLayout] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 300,
    upward: false,
  });
  const { rootRef, settings, appearanceProps } = useAppearanceComponentSettings("dropdown", {
    ...DROPDOWN_DEFAULTS,
    label,
    defaultValue,
    showLabel: variant === "inline",
    itemHeight: variant === "inline" ? 49 : 36,
    searchPlaceholder: tr("components.search"),
    emptyText: tr("components.noOptions"),
    ...defaults,
  });
  const previousDefault = useRef(settings.defaultValue);
  useEffect(() => {
    if (previousDefault.current !== settings.defaultValue) {
      previousDefault.current = settings.defaultValue;
      if (value === undefined) setInternalValue(settings.defaultValue);
    }
  }, [settings.defaultValue, value]);
  const selected = value ?? internalValue;
  const expanded = (open ?? internalOpen) && !disabled;
  const normalizedOptions = useMemo(
    () =>
      options.map((option) =>
        typeof option === "string" ? { value: option, label: option } : option,
      ),
    [options],
  );
  const results = useMemo(
    () => filterSelectOptions(normalizedOptions, settings.searchEnabled ? query : "", settings),
    [normalizedOptions, query, settings],
  );
  const selectedOption = normalizedOptions.find((option) => option.value === selected);
  const selectedIndex = results.findIndex(
    (option) => option.value === selected && !option.disabled,
  );
  const activeIndex =
    active >= 0 && results[active] && !results[active].disabled
      ? active
      : !query && selectedIndex >= 0
        ? selectedIndex
        : nextSelectIndex(results, -1, 1, false);
  const itemHeight = Math.max(24, settings.itemHeight);
  const changeOpen = (next: boolean) => {
    if (disabled) return;
    setInternalOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setQuery("");
      setActive(-1);
    }
  };
  const select = (option: SelectOption) => {
    if (option.disabled || disabled) return;
    setInternalValue(option.value);
    if (settings.closeOnSelect) {
      // Legacy selection handlers may also close the menu. Notify about closing first
      // so their explicit closed state wins over a functional toggle callback.
      changeOpen(false);
      triggerRef.current?.focus();
    }
    onChange(option.value);
  };

  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setInternalOpen(false);
        onOpenChange?.(false);
        setQuery("");
        setActive(-1);
      }
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [expanded, onOpenChange, rootRef]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const position = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const header = settings.searchEnabled ? 48 : 0;
      const height =
        Math.min(Math.max(results.length, 1), settings.visibleItems) * itemHeight + header + 2;
      const below = window.innerHeight - rect.bottom - 8 - settings.menuGap;
      const above = rect.top - 8 - settings.menuGap;
      const upward =
        settings.placement === "up" ||
        (settings.placement === "auto" && below < height && above > below);
      const maxHeight = Math.max(24, Math.min(height, upward ? above : below));
      const width = Math.min(Math.max(rect.width, settings.menuMinWidth), window.innerWidth - 16);
      setLayout({
        top: upward
          ? Math.max(8, rect.top - settings.menuGap - maxHeight)
          : rect.bottom + settings.menuGap,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width,
        maxHeight,
        upward,
      });
    };
    position();
    const scroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) position();
    };
    window.addEventListener("resize", position);
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [
    expanded,
    itemHeight,
    results.length,
    rootRef,
    settings.menuGap,
    settings.menuMinWidth,
    settings.placement,
    settings.searchEnabled,
    settings.visibleItems,
  ]);

  useLayoutEffect(() => {
    if (expanded && settings.searchEnabled) searchRef.current?.focus();
  }, [expanded, settings.searchEnabled]);
  useLayoutEffect(() => {
    if (expanded)
      menuRef.current
        ?.querySelector(`[data-option-index="${activeIndex}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [expanded, activeIndex]);

  const keyboard = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      changeOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab" && expanded) {
      changeOpen(false);
      // The search input lives in a portal; continue tabbing from its trigger.
      if (event.target === searchRef.current) triggerRef.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      if (!expanded) {
        changeOpen(true);
        setActive(results.findIndex((option) => option.value === selected));
      } else
        setActive(
          nextSelectIndex(
            results,
            activeIndex,
            event.key === "ArrowDown" ? 1 : -1,
            settings.wrapNavigation,
          ),
        );
    } else if (
      expanded &&
      (event.key === "Home" || event.key === "End") &&
      event.target !== searchRef.current
    ) {
      event.preventDefault();
      setActive(
        nextSelectIndex(
          results,
          event.key === "Home" ? -1 : results.length,
          event.key === "Home" ? 1 : -1,
          false,
        ),
      );
    } else if (event.key === "Enter" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      if (activeIndex >= 0) select(results[activeIndex]);
    } else if (
      !expanded &&
      event.key.length === 1 &&
      event.key !== " " &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      settings.searchEnabled
    ) {
      event.preventDefault();
      changeOpen(true);
      setQuery(event.key);
      setActive(-1);
    }
  };

  const menu = (
    <div
      ref={menuRef}
      className={`inline-dropdown-menu ${inlineMenu ? "inline-dropdown-menu-inline" : "inline-dropdown-menu-portal"} ${variant !== "inline" ? "inline-dropdown-menu--compact" : ""} ${layout.upward && !inlineMenu ? "inline-dropdown-menu-up" : ""}`}
      style={
        {
          ...(!inlineMenu ? { top: layout.top, left: layout.left, width: layout.width } : {}),
          "--inline-dropdown-item-height": `${itemHeight}px`,
        } as CSSProperties
      }
      onClick={(event) => event.stopPropagation()}
    >
      {settings.searchEnabled && (
        <div className="select-search-row">
          <input
            ref={searchRef}
            role="combobox"
            aria-label={settings.searchPlaceholder}
            aria-expanded={expanded}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
            placeholder={settings.searchPlaceholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(-1);
            }}
            spellCheck={false}
            autoComplete="off"
          />
          {settings.showResultCount && <span>{results.length}</span>}
        </div>
      )}
      <CustomScrollArea
        style={{
          maxHeight: inlineMenu
            ? settings.visibleItems * itemHeight
            : Math.max(24, layout.maxHeight - (settings.searchEnabled ? 48 : 0)),
        }}
        onWheel={(event) => event.stopPropagation()}
      >
        <div
          id={`${id}-list`}
          role="listbox"
          aria-label={settings.label || label}
          className="inline-dropdown-menu-content"
        >
          {results.length === 0 && (
            <div className="select-empty" role="status">
              {settings.emptyText}
            </div>
          )}
          {results.map((option, index) => (
            <button
              key={option.value}
              id={`${id}-option-${index}`}
              type="button"
              role="option"
              aria-selected={option.value === selected}
              aria-disabled={option.disabled || undefined}
              disabled={option.disabled}
              tabIndex={-1}
              data-option-index={index}
              data-active={index === activeIndex ? "true" : undefined}
              className={`inline-dropdown-item ${option.value === selected ? "selected" : ""}`}
              onPointerDown={(event) => event.preventDefault()}
              onPointerMove={() => {
                if (!option.disabled) setActive(index);
              }}
              onClick={() => select(option)}
            >
              <span className="inline-dropdown-item-label">
                <Highlight
                  text={option.label}
                  query={query}
                  enabled={settings.highlightMatches}
                  caseSensitive={settings.caseSensitive}
                />
                {settings.showDescriptions && option.description && (
                  <small className="select-description">{option.description}</small>
                )}
              </span>
              {settings.showDefaultMarker && option.value === settings.defaultValue && (
                <span className="select-default-marker" aria-label={tr("components.default")}>
                  │
                </span>
              )}
              {(option.adornment || renderAdornment) && (
                <span className="inline-dropdown-item-badge">
                  {option.adornment ?? renderAdornment?.(option.value)}
                </span>
              )}
              {settings.showSelectedMark && option.value === selected && (
                <span aria-hidden="true">✓</span>
              )}
            </button>
          ))}
        </div>
      </CustomScrollArea>
    </div>
  );

  return (
    <div
      {...appearanceProps}
      className={`inline-dropdown searchable-select ${variant === "compact" ? "inline-dropdown--compact" : ""} ${variant === "field" ? "searchable-select--field" : ""} ${expanded ? "open" : ""} ${className}`}
      onKeyDown={keyboard}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`inline-dropdown-trigger ${triggerClassName}`}
        disabled={disabled}
        aria-label={settings.label || label || tr("ui.selectOption")}
        aria-expanded={expanded}
        aria-haspopup="listbox"
        aria-controls={expanded ? `${id}-list` : undefined}
        aria-activedescendant={
          expanded && !settings.searchEnabled && activeIndex >= 0
            ? `${id}-option-${activeIndex}`
            : undefined
        }
        onClick={(event) => {
          event.stopPropagation();
          changeOpen(!expanded);
        }}
      >
        <span className="inline-dropdown-trigger-inner">
          {settings.showLabel && <span className="inline-dropdown-label">{settings.label}</span>}
          <span className="inline-dropdown-trigger-row">
            <span className="inline-dropdown-value">
              {selectedOption?.label ?? (selected || placeholder || tr("ui.selectOption"))}
            </span>
          </span>
        </span>
        {(selectedOption?.adornment || renderAdornment) && (
          <span className="inline-dropdown-trigger-badge-abs">
            {selectedOption?.adornment ?? renderAdornment?.(selected)}
          </span>
        )}
        {settings.showArrow && (
          <span className="inline-dropdown-chevron-wrap" aria-hidden="true">
            <CustomArrow open={expanded} />
          </span>
        )}
      </button>
      {settings.showClear && selected && !disabled && (
        <button
          className="select-clear"
          type="button"
          disabled={!allowEmpty}
          aria-label={tr("components.clear")}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setInternalValue("");
            onChange("");
            triggerRef.current?.focus();
          }}
        >
          ×
        </button>
      )}
      {expanded &&
        (inlineMenu
          ? menu
          : createPortal(menu, rootRef.current?.closest("dialog[open]") ?? document.body))}
    </div>
  );
}
