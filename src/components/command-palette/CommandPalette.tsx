import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
  type CSSProperties,
} from "react";
import { useTranslation } from "../../i18n/locale";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { ModrinthProjectIcon } from "../modrinth/ModrinthProjectIcon";
import type { ModrinthProject } from "../../types";
import type { PaletteCatalogTargets } from "./paletteCatalog";
import { usePaletteCatalog } from "./usePaletteCatalog";
import { getPaletteContextLayout, type PaletteContextLayout } from "./paletteContextLayout";
import { usePalettePresence } from "./usePalettePresence";
import { usePaletteElasticDrag } from "./usePaletteElasticDrag";
import {
  filterPaletteCommands,
  isCommandPaletteShortcut,
  parsePaletteQuery,
  CATALOG_KINDS,
  type CatalogKind,
  type PaletteCommand,
} from "./commandSearch";
import "./CommandPalette.css";

type CommandPaletteProps = {
  commands: PaletteCommand[];
  onSearchContent: (kind: CatalogKind, query: string) => void;
  onOpenProject: (kind: CatalogKind, project: ModrinthProject) => void;
  catalogTargets: PaletteCatalogTargets;
  sessionAnchor: RefObject<HTMLDivElement | null>;
  session: { playerName: string; buildName: string };
  disabled?: boolean;
  animationsEnabled?: boolean;
};

function CommandIcon({ icon }: { icon: PaletteCommand["icon"] }) {
  const paths: Record<PaletteCommand["icon"], string> = {
    arrow: "M4 10h12m-5-5 5 5-5 5",
    build: "m10 2 7 4v8l-7 4-7-4V6l7-4Zm0 8v8M3 6l7 4 7-4",
    folder: "M2 5a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5Z",
    plus: "M10 4v12M4 10h12",
    play: "m6 3 11 7-11 7V3Z",
    search: "M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-2 4 6 6",
    settings: "M3 5h14M3 10h14M3 15h14M7 3v4m6 1v4m-6 1v4",
    archive: "M3 3h14v4H3V3Zm1 4v10h12V7M8 10h4",
  };
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d={paths[icon]}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CommandPalette({
  commands,
  onSearchContent,
  onOpenProject,
  catalogTargets,
  sessionAnchor,
  session,
  disabled = false,
  animationsEnabled = true,
}: CommandPaletteProps) {
  const tr = useTranslation();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const presence = usePalettePresence(disabled, animationsEnabled, () =>
    dialogRef.current?.close(),
  );
  const open = presence.present;
  const togglePresence = presence.toggle;
  const [contextLayout, setContextLayout] = useState<PaletteContextLayout | null>(null);
  usePaletteElasticDrag(dialogRef, contextLayout, presence.phase, presence.animated);
  const [query, setQuery] = useState("");
  const [activeCommandId, setActiveCommandId] = useState<string | null>(null);
  const search = parsePaletteQuery(query);
  const catalog = usePaletteCatalog(open, query, catalogTargets);
  const localResults = filterPaletteCommands(commands, query);
  const projects: PaletteCommand[] = catalog.projects.map(({ kind, project }) => ({
    id: `project:${kind}:${project.projectId}`,
    label: project.title,
    description: [
      project.author,
      project.installed ? tr("commandPalette.installed") : catalogTargets[kind]?.name,
    ]
      .filter(Boolean)
      .join(" · "),
    category: tr(`commandPalette.${kind}`),
    imageUrl: project.iconUrl,
    icon: "search",
    run: () => onOpenProject(kind, project),
  }));
  const searches: PaletteCommand[] = search.query
    ? CATALOG_KINDS.filter((kind) => !search.kind || kind === search.kind).map((kind) => ({
        id: `search:${kind}`,
        label: tr(`commandPalette.search.${kind}`, { query: search.query }),
        description: catalogTargets[kind]
          ? tr("commandPalette.searchTarget", { name: catalogTargets[kind]!.name })
          : tr(kind === "mods" ? "commandPalette.searchNeedsBuild" : "commandPalette.selectBuild"),
        category: tr(`commandPalette.${kind}`),
        icon: "search",
        run: () => onSearchContent(kind, search.query),
      }))
    : [];
  const results = [...localResults, ...projects, ...searches];
  const activeIndex = results.findIndex((command) => command.id === activeCommandId);
  const selectedIndex = results.length ? Math.max(0, activeIndex) : -1;
  const activeId = selectedIndex >= 0 ? `${id}-option-${selectedIndex}` : undefined;
  const selectedCommandParts = results[selectedIndex]?.id.split(":") ?? [];
  const selectedContentKind = ["project", "search"].includes(selectedCommandParts[0])
    ? CATALOG_KINDS.find((kind) => kind === selectedCommandParts[1])
    : undefined;
  const contentTarget = selectedContentKind ? catalogTargets[selectedContentKind] : null;

  const close = () => presence.close();
  const execute = (command: PaletteCommand) => {
    presence.close(command.run);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = sessionAnchor.current;
    const measure = () => {
      const next = getPaletteContextLayout(
        anchor?.getBoundingClientRect() ?? null,
        window.innerWidth,
        window.innerHeight,
      );
      // Scrolling the results also fires this listener; leave a live drag undisturbed.
      setContextLayout((previous) =>
        previous !== null &&
        previous.clipPath === next.clipPath &&
        previous.connector === next.connector &&
        previous.viewport.width === next.viewport.width &&
        previous.viewport.height === next.viewport.height &&
        previous.panel.left === next.panel.left &&
        previous.panel.top === next.panel.top &&
        previous.panel.width === next.panel.width &&
        previous.panel.height === next.panel.height
          ? previous
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (anchor) {
      observer.observe(anchor);
      const sidebar = anchor.closest(".sidebar");
      if (sidebar) observer.observe(sidebar);
    }
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, sessionAnchor, session.playerName, session.buildName]);

  useEffect(() => {
    const onShortcut = (event: globalThis.KeyboardEvent) => {
      if (disabled || event.isComposing || !isCommandPaletteShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (togglePresence()) {
        setQuery("");
        setActiveCommandId(null);
      }
    };
    window.addEventListener("keydown", onShortcut, true);
    return () => window.removeEventListener("keydown", onShortcut, true);
  }, [disabled, togglePresence]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open || disabled) return;
    // A native modal keeps focus inside and restores it to the previous control on close.
    dialog.showModal();
    inputRef.current?.focus();
    return () => dialog.close();
  }, [open, disabled]);

  useEffect(() => {
    if (presence.phase === "opening" && dialogRef.current?.open) inputRef.current?.focus();
  }, [presence.phase]);

  useEffect(() => {
    if (open && activeId) {
      document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeId, query]);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    event.stopPropagation();
    if (presence.phase === "closing") {
      event.preventDefault();
      return;
    }
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length) {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActiveCommandId(
          results[(selectedIndex + direction + results.length) % results.length].id,
        );
        inputRef.current?.focus();
      }
    } else if (event.key === "Enter" && event.target === inputRef.current) {
      event.preventDefault();
      if (!event.repeat && results[selectedIndex]) execute(results[selectedIndex]);
    }
  };

  return (
    <>
      <dialog
        ref={dialogRef}
        id={`${id}-dialog`}
        className="command-palette-layer"
        data-phase={presence.phase}
        data-animated={presence.animated}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-context`}
        aria-modal="true"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onKeyDown={onKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (event.target === event.currentTarget) close();
        }}
        onWheel={(event) => event.stopPropagation()}
      >
        <div
          className="command-palette-scrim"
          style={{ clipPath: contextLayout?.clipPath }}
          onClick={close}
          aria-hidden="true"
        />
        <span id={`${id}-context`} className="command-palette-context-description">
          {tr("commandPalette.context", { player: session.playerName, build: session.buildName })}
        </span>
        {contextLayout?.spotlight && (
          <>
            <div
              className="command-palette-context-frame"
              aria-hidden="true"
              style={{
                left: contextLayout.spotlight.left,
                top: contextLayout.spotlight.top,
                width: contextLayout.spotlight.width,
                height: contextLayout.spotlight.height,
              }}
            >
              <span className="command-palette-context-tag">{tr("commandPalette.contextTag")}</span>
              <svg
                className="command-palette-context-corners"
                width="100%"
                height="100%"
                viewBox={`0 0 ${contextLayout.spotlight.width} ${contextLayout.spotlight.height}`}
                aria-hidden="true"
              >
                <path
                  pathLength={1}
                  d={`M 0 10 V 0 H 10 M ${contextLayout.spotlight.width - 10} 0 H ${contextLayout.spotlight.width} V 10 M ${contextLayout.spotlight.width} ${contextLayout.spotlight.height - 10} V ${contextLayout.spotlight.height} H ${contextLayout.spotlight.width - 10} M 10 ${contextLayout.spotlight.height} H 0 V ${contextLayout.spotlight.height - 10}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
            <svg
              className="command-palette-context-connector"
              width="100%"
              height="100%"
              viewBox={`0 0 ${contextLayout.viewport.width} ${contextLayout.viewport.height}`}
              aria-hidden="true"
            >
              <path
                className="command-palette-connection-track"
                d={contextLayout.connector ?? undefined}
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <path
                className="command-palette-connection-line"
                pathLength={1}
                d={contextLayout.connector ?? undefined}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {contextLayout.connection && (
                <>
                  <circle
                    className="command-palette-connection-port command-palette-connection-port--start"
                    cx={contextLayout.connection.start.x}
                    cy={contextLayout.connection.start.y}
                    r="2.5"
                  />
                  <circle
                    className="command-palette-connection-port command-palette-connection-port--end"
                    cx={contextLayout.connection.end.x}
                    cy={contextLayout.connection.end.y}
                    r="2.5"
                  />
                </>
              )}
            </svg>
          </>
        )}
        <div
          className="command-palette-drag-shell"
          style={
            contextLayout
              ? {
                  left: contextLayout.panel.left,
                  top: contextLayout.panel.top,
                  width: contextLayout.panel.width,
                  maxHeight: contextLayout.panel.height,
                  transformOrigin: contextLayout.connection
                    ? `${contextLayout.connection.end.x - contextLayout.panel.left}px ${contextLayout.connection.end.y - contextLayout.panel.top}px`
                    : "50% 0",
                }
              : undefined
          }
        >
          <div
            className="command-palette"
            data-connection-edge={contextLayout?.connection?.edge ?? "top"}
          >
            <div className="command-palette-heading" title={tr("commandPalette.drag")}>
              <span id={`${id}-title`}>{tr("commandPalette.title")}</span>
              <span className="command-palette-drag-grip" aria-hidden="true" />
              <kbd>{tr("commandPalette.shortcut")}</kbd>
            </div>
            {contentTarget && contentTarget.name !== session.buildName && (
              <div className="command-palette-destination">
                {tr("commandPalette.contentTarget", { name: contentTarget.name })}
              </div>
            )}
            {!contextLayout?.spotlight && (
              <div className="command-palette-context-inline">
                <span>
                  <small>{tr("app.player")}</small>
                  <strong>{session.playerName}</strong>
                </span>
                <span>
                  <small>{tr("common.buildCaps")}</small>
                  <strong>{session.buildName}</strong>
                </span>
              </div>
            )}
            <div className="command-palette-search">
              <CommandIcon icon="search" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveCommandId(null);
                }}
                placeholder={tr("commandPalette.placeholder")}
                aria-label={tr("commandPalette.placeholder")}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={`${id}-results`}
                aria-activedescendant={activeId}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                className="command-palette-close"
                type="button"
                onClick={close}
                aria-label={tr("common.close")}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path
                    d="m3 3 6 6m0-6-6 6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <CustomScrollArea
              className="command-palette-scroll"
              onWheel={(event) => event.stopPropagation()}
            >
              <div
                className="command-palette-results"
                id={`${id}-results`}
                role="listbox"
                aria-label={tr("commandPalette.results")}
                aria-busy={catalog.loading}
              >
                {results.map((command, index) => (
                  <button
                    key={command.id}
                    id={`${id}-option-${index}`}
                    className="command-palette-result"
                    style={
                      {
                        "--palette-row-delay": `${100 + Math.min(index, 6) * 14}ms`,
                      } as CSSProperties
                    }
                    type="button"
                    role="option"
                    aria-selected={index === selectedIndex}
                    tabIndex={-1}
                    onMouseMove={() => setActiveCommandId(command.id)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => execute(command)}
                  >
                    <span className="command-palette-icon">
                      {command.id.startsWith("project:") ? (
                        <ModrinthProjectIcon iconUrl={command.imageUrl} title={command.label} />
                      ) : (
                        <CommandIcon icon={command.icon} />
                      )}
                    </span>
                    <span className="command-palette-copy">
                      <strong>{command.label}</strong>
                      {command.description && <small>{command.description}</small>}
                    </span>
                    {command.category && (
                      <em className="command-palette-category">{command.category}</em>
                    )}
                  </button>
                ))}
                {results.length === 0 && (
                  <p className="command-palette-empty">{tr("commandPalette.empty")}</p>
                )}
              </div>
              {catalog.loading && (
                <p className="command-palette-status" role="status">
                  {tr("commandPalette.loading")}
                </p>
              )}
              {catalog.failed.length > 0 && (
                <p className="command-palette-status" role="status">
                  {tr("commandPalette.catalogError", {
                    kinds: catalog.failed.map((kind) => tr(`commandPalette.${kind}`)).join(", "),
                  })}
                </p>
              )}
            </CustomScrollArea>
          </div>
        </div>
      </dialog>
    </>
  );
}
