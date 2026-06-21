import { useEffect, useState } from "react";
import {
  DEFAULT_BUILD_CARD_APPEARANCE,
  normalizeBuildCardAppearance,
  type BuildCardAppearance,
} from "../components/builds/BuildCardSettingsPopup";
import { logger } from "../utils/logger";

const STORAGE_KEY = "screenlauncher-build-card-backgrounds";

/**
 * Per-instance build-card appearance overrides, persisted to `localStorage`.
 * Entries are keyed by instance id (plus a sentinel key for the create card).
 */
export function useBuildCardAppearances() {
  const [appearances, setAppearances] = useState<Record<string, BuildCardAppearance>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      setAppearances(
        Object.fromEntries(
          Object.entries(parsed).map(([key, value]) => [key, normalizeBuildCardAppearance(value)]),
        ) as Record<string, BuildCardAppearance>,
      );
    } catch (error) {
      logger.error(error);
    }
  }, []);

  const persistAppearances = (next: Record<string, BuildCardAppearance>) => {
    setAppearances(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const getAppearance = (targetId: string | null | undefined) => {
    if (!targetId) return { ...DEFAULT_BUILD_CARD_APPEARANCE };
    return normalizeBuildCardAppearance(appearances[targetId]);
  };

  return { appearances, persistAppearances, getAppearance };
}
