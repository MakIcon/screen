import { useState } from "react";
import { openBuildPlaceholdersWindow } from "../builds/buildPlaceholdersWindow";
import { logger } from "../../utils/logger";
import "./PlaceholderGuideButton.css";

export function PlaceholderGuideButton({ compact = false }: { compact?: boolean }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  async function openGuide() {
    setOpening(true);
    setError("");
    try {
      await openBuildPlaceholdersWindow();
    } catch (cause) {
      logger.error(cause);
      setError("Не удалось открыть справочник плейсхолдеров. Попробуй ещё раз.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className={`placeholder-guide${compact ? " placeholder-guide--compact" : ""}`}>
      <button
        type="button"
        className="placeholder-guide-button"
        disabled={opening}
        aria-busy={opening}
        aria-label="Открыть справочник плейсхолдеров"
        onClick={() => void openGuide()}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M4 2h7l3 3v11H4zM11 2v4h3" stroke="currentColor" strokeWidth="1.2" />
          <path
            d="m7 12 4-4M6.5 8h1M10.5 12h1"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        <span>Плейсхолдеры</span>
        <svg
          className="placeholder-guide-arrow"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path d="M4 3h7v7M11 3l-8 8" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
      {error && (
        <p className="placeholder-guide-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
