import { useEffect, useRef, useState, type CSSProperties } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppearance } from "../../appearance/useAppearance";
import { logger } from "../../utils/logger";
import { useLocale, useTranslation, Trans } from "../../i18n/locale";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { usePinnedPaperDrag } from "./usePinnedPaperDrag";
import {
  findGuidePlaceholders,
  getPlaceholderGuideDescription,
  PLACEHOLDER_GUIDE_GROUPS,
  type GuidePlaceholderGroup,
} from "./buildPlaceholdersGuide";
import "../../App.css";
import "./BuildPlaceholdersWindowApp.css";

const REST_TILT_STORAGE_KEY = "screenlauncher:placeholders:rest-tilt";
const DRAG_ANIMATION_STORAGE_KEY = "screenlauncher:placeholders:drag-animation";

function readPreferenceEnabled(key: string) {
  try {
    return window.localStorage.getItem(key) !== "false";
  } catch {
    return true;
  }
}

function savePreference(key: string, enabled: boolean) {
  try {
    window.localStorage.setItem(key, String(enabled));
  } catch (error) {
    logger.error(error);
  }
}

function closeGuide() {
  if (isTauri()) void getCurrentWindow().close().catch(logger.error);
  else window.close();
}

function CopyIcon({ copied }: { copied: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {copied ? (
        <path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="1.5" />
      ) : (
        <>
          <rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" />
          <path d="M3 10H2V2h8v1" stroke="currentColor" />
        </>
      )}
    </svg>
  );
}

export function BuildPlaceholdersWindowApp() {
  useAppearance();
  const locale = useLocale();
  const tr = useTranslation();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<GuidePlaceholderGroup | "all">("all");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const [restTiltEnabled, setRestTiltEnabled] = useState(() =>
    readPreferenceEnabled(REST_TILT_STORAGE_KEY),
  );
  const [dragAnimationEnabled, setDragAnimationEnabled] = useState(() =>
    readPreferenceEnabled(DRAG_ANIMATION_STORAGE_KEY),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLElement>(null);
  const startDrag = usePinnedPaperDrag(paperRef, dragAnimationEnabled);
  const placeholders = findGuidePlaceholders(query, group, locale);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeGuide();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    scrollRef.current?.querySelector(".csa-content")?.scrollTo({ top: 0 });
  }, [query, group]);

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedToken(token);
      setCopyError(false);
    } catch (error) {
      logger.error(error);
      setCopyError(true);
    }
  }

  function toggleRestTilt() {
    const enabled = !restTiltEnabled;
    setRestTiltEnabled(enabled);
    savePreference(REST_TILT_STORAGE_KEY, enabled);
  }

  function toggleDragAnimation() {
    const enabled = !dragAnimationEnabled;
    setDragAnimationEnabled(enabled);
    savePreference(DRAG_ANIMATION_STORAGE_KEY, enabled);
  }

  return (
    <main className="bpg-surface" lang={locale}>
      <article
        className="bpg-paper"
        aria-labelledby="bpg-title"
        ref={paperRef}
        style={{ "--bpg-rest-angle": restTiltEnabled ? "-0.45deg" : "0deg" } as CSSProperties}
      >
        <div className="bpg-pin-hole" aria-hidden="true" />
        <div className="bpg-pin" aria-hidden="true" onPointerDown={startDrag} />
        <div className="bpg-paper-grain" aria-hidden="true" />
        <div className="bpg-window-actions" onMouseDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="bpg-preference-toggle"
            aria-label={tr("buildPlaceholders.restingTilt")}
            aria-pressed={restTiltEnabled}
            data-tooltip={tr("buildPlaceholders.slightTiltOfThe")}
            onClick={toggleRestTilt}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect
                x="3"
                y="2"
                width="8"
                height="10"
                stroke="currentColor"
                strokeWidth="1.2"
                transform={restTiltEnabled ? "rotate(-12 7 7)" : undefined}
              />
            </svg>
            <span>{tr("buildPlaceholders.tilt")}</span>
            <span className="bpg-preference-state">
              {restTiltEnabled ? tr("common.on") : tr("common.off")}
            </span>
          </button>
          <button
            type="button"
            className="bpg-preference-toggle"
            aria-label={tr("buildPlaceholders.dragAnimation")}
            aria-pressed={dragAnimationEnabled}
            data-tooltip={tr("buildPlaceholders.sheetSwayAndPin")}
            onClick={toggleDragAnimation}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="5" y="2" width="7" height="10" stroke="currentColor" strokeWidth="1.2" />
              <path d="M1 4h2M0 7h3M1 10h2" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            <span>{tr("buildPlaceholders.animation")}</span>
            <span className="bpg-preference-state">
              {dragAnimationEnabled ? tr("common.on") : tr("common.off")}
            </span>
          </button>
          {isTauri() && (
            <button
              type="button"
              aria-label={tr("buildPlaceholders.minimizeWindow")}
              onClick={() => void getCurrentWindow().minimize().catch(logger.error)}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M3 9h8" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          )}
          <button
            type="button"
            aria-label={tr("buildPlaceholders.closeWindow")}
            onClick={closeGuide}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="m3 3 8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        <header
          className="bpg-header"
          onPointerDown={(event) => {
            if (!(event.target instanceof Element) || !event.target.closest("button, input"))
              startDrag(event);
          }}
        >
          <span className="bpg-kicker">{tr("buildPlaceholders.screenlauncherCheatSheet")}</span>
          <h1 id="bpg-title">{tr("buildPlaceholders.placeholders")}</h1>
          <p>{tr("buildPlaceholders.theyInsertDataInto")}</p>
        </header>

        <div className="bpg-controls">
          <label className="bpg-search">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="m10 10 4 4" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            <input
              type="search"
              aria-label={tr("buildPlaceholders.findAPlaceholder")}
              placeholder={tr("buildPlaceholders.searchByNameOr")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <nav className="bpg-filters" aria-label={tr("buildPlaceholders.placeholderGroups")}>
            {(["all", ...PLACEHOLDER_GUIDE_GROUPS] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={group === item}
                onClick={() => setGroup(item)}
              >
                {item === "all"
                  ? tr("buildPlaceholders.all")
                  : tr(`placeholderGuide.group.${item}`)}
              </button>
            ))}
          </nav>
          <div className="bpg-case-note">
            {group === "bot" ? (
              <span>{tr("buildPlaceholders.thesePlaceholdersOnlyWork")}</span>
            ) : (
              <>
                <code>^%build_loader%</code>
                <span>→</span>
                <strong>FABRIC</strong>
                <span>
                  <Trans k="buildPlaceholders.caretHint" values={{ caret: <code>^</code> }} />
                </span>
              </>
            )}
          </div>
          {copyError && (
            <p className="bpg-copy-error" role="alert">
              {tr("buildPlaceholders.copyFailedYouCan")}
            </p>
          )}
        </div>

        <div className="bpg-list-shell" ref={scrollRef}>
          <CustomScrollArea className="bpg-scroll">
            {PLACEHOLDER_GUIDE_GROUPS.map((item) => {
              const entries = placeholders.filter((placeholder) => placeholder.group === item);
              if (entries.length === 0) return null;
              return (
                <section className="bpg-group" key={item} aria-labelledby={`bpg-${item}`}>
                  <h2 id={`bpg-${item}`}>{tr(`placeholderGuide.group.${item}`)}</h2>
                  <dl className="bpg-entries">
                    {entries.map((placeholder) => (
                      <div className="bpg-entry" key={placeholder.key}>
                        <dt>
                          <div
                            className={`bpg-token-group ${placeholder.aliases?.length ? "bpg-token-group--alternatives" : ""}`}
                          >
                            {[
                              placeholder.token,
                              ...(placeholder.aliases ?? []).map((alias) => `%${alias}%`),
                            ].map((token) => (
                              <button
                                key={token}
                                type="button"
                                className={`bpg-token ${copiedToken === token ? "bpg-token--copied" : ""}`}
                                aria-label={tr("buildPlaceholders.copy", { token })}
                                data-tooltip={
                                  copiedToken === token
                                    ? tr("buildPlaceholders.copied")
                                    : tr("buildPlaceholders.copy2")
                                }
                                onClick={() => void copyToken(token)}
                              >
                                <code>{token}</code>
                                <CopyIcon copied={copiedToken === token} />
                              </button>
                            ))}
                          </div>
                        </dt>
                        <dd>{getPlaceholderGuideDescription(placeholder, locale)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
            {placeholders.length === 0 && (
              <p className="bpg-empty">{tr("buildPlaceholders.nothingFoundTryAnother")}</p>
            )}
          </CustomScrollArea>
        </div>
        <span className="bpg-copy-status" role="status" aria-live="polite">
          {copiedToken ? `${tr("buildPlaceholders.copied")}: ${copiedToken}` : ""}
        </span>
      </article>
    </main>
  );
}
