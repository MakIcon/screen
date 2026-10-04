import { useEffect, useRef, useState, type CSSProperties } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppearance } from "../../appearance/useAppearance";
import type { PlaceholderGroup } from "../../utils/placeholders";
import { logger } from "../../utils/logger";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { usePinnedPaperDrag } from "./usePinnedPaperDrag";
import {
  findGuidePlaceholders,
  getPlaceholderGuideDescription,
  PLACEHOLDER_GUIDE_GROUPS,
} from "./buildPlaceholdersGuide";
import "../../App.css";
import "./BuildPlaceholdersWindowApp.css";

const REST_TILT_STORAGE_KEY = "screenlauncher:placeholders:rest-tilt";

function readRestTiltEnabled() {
  try {
    return window.localStorage.getItem(REST_TILT_STORAGE_KEY) !== "false";
  } catch {
    return true;
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
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<PlaceholderGroup | "all">("all");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const [restTiltEnabled, setRestTiltEnabled] = useState(readRestTiltEnabled);
  const scrollRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLElement>(null);
  const startDrag = usePinnedPaperDrag(paperRef);
  const placeholders = findGuidePlaceholders(query, group);

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
    try {
      window.localStorage.setItem(REST_TILT_STORAGE_KEY, String(enabled));
    } catch (error) {
      logger.error(error);
    }
  }

  return (
    <main className="bpg-surface" lang="ru">
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
            className="bpg-tilt-toggle"
            aria-label="Наклон листа в покое"
            aria-pressed={restTiltEnabled}
            title="Лёгкий наклон листа в покое"
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
            <span>Наклон</span>
            <span className="bpg-tilt-state">{restTiltEnabled ? "Вкл" : "Выкл"}</span>
          </button>
          {isTauri() && (
            <button
              type="button"
              aria-label="Свернуть окно"
              onClick={() => void getCurrentWindow().minimize().catch(logger.error)}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M3 9h8" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          )}
          <button type="button" aria-label="Закрыть окно" onClick={closeGuide}>
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
          <span className="bpg-kicker">SCREENLAUNCHER · ПАМЯТКА</span>
          <h1 id="bpg-title">Плейсхолдеры</h1>
          <p>Подставляют данные в текст. Нажми на код, чтобы скопировать.</p>
        </header>

        <div className="bpg-controls">
          <label className="bpg-search">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="m10 10 4 4" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            <input
              type="search"
              aria-label="Найти плейсхолдер"
              placeholder="Найти по названию или смыслу…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <nav className="bpg-filters" aria-label="Группы плейсхолдеров">
            {[{ id: "all" as const, label: "Все" }, ...PLACEHOLDER_GUIDE_GROUPS].map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={group === item.id}
                onClick={() => setGroup(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="bpg-case-note">
            <code>^%build_loader%</code>
            <span>→</span>
            <strong>FABRIC</strong>
            <span>
              Знак <code>^</code> делает буквы заглавными.
            </span>
          </div>
          {copyError && (
            <p className="bpg-copy-error" role="alert">
              Не удалось скопировать. Можно выделить код и скопировать вручную.
            </p>
          )}
        </div>

        <div className="bpg-list-shell" ref={scrollRef}>
          <CustomScrollArea className="bpg-scroll">
            {PLACEHOLDER_GUIDE_GROUPS.map((item) => {
              const entries = placeholders.filter((placeholder) => placeholder.group === item.id);
              if (entries.length === 0) return null;
              return (
                <section className="bpg-group" key={item.id} aria-labelledby={`bpg-${item.id}`}>
                  <h2 id={`bpg-${item.id}`}>{item.label}</h2>
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
                                aria-label={`Скопировать ${token}`}
                                title={copiedToken === token ? "Скопировано" : "Скопировать"}
                                onClick={() => void copyToken(token)}
                              >
                                <code>{token}</code>
                                <CopyIcon copied={copiedToken === token} />
                              </button>
                            ))}
                          </div>
                        </dt>
                        <dd>{getPlaceholderGuideDescription(placeholder)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
            {placeholders.length === 0 && (
              <p className="bpg-empty">Ничего не найдено. Попробуй другое слово.</p>
            )}
          </CustomScrollArea>
        </div>
        <span className="bpg-copy-status" role="status" aria-live="polite">
          {copiedToken ? `Скопировано: ${copiedToken}` : ""}
        </span>
      </article>
    </main>
  );
}
