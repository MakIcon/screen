import { useEffect, useState } from "react";
import {
  DEFAULT_BUILD_CARD_APPEARANCE,
  normalizeBuildCardAppearance,
  type BuildCardAppearance,
} from "../components/builds/BuildCardSettingsPopup";
import {
  LEGACY_BUILD_CARD_APPEARANCES_KEY,
  readBuildCardAppearances,
  writeBuildCardAppearances,
} from "../storage/buildCardAppearances";
import { logger } from "../utils/logger";

function normalizeAppearances(value: unknown): Record<string, BuildCardAppearance> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).map(([key, appearance]) => [
      key,
      normalizeBuildCardAppearance(appearance),
    ]),
  ) as Record<string, BuildCardAppearance>;
}

function readLegacyAppearances(): Record<string, BuildCardAppearance> | undefined {
  const raw = window.localStorage.getItem(LEGACY_BUILD_CARD_APPEARANCES_KEY);
  if (!raw) return undefined;
  return normalizeAppearances(JSON.parse(raw));
}

/**
 * Per-instance build-card appearance overrides, persisted to IndexedDB.
 * Entries are keyed by instance id (plus a sentinel key for the create card).
 */
export function useBuildCardAppearances() {
  const [appearances, setAppearances] = useState<Record<string, BuildCardAppearance>>({});

  useEffect(() => {
    let active = true;

    void (async () => {
      let legacyAppearances: Record<string, BuildCardAppearance> | undefined;
      try {
        legacyAppearances = readLegacyAppearances();
      } catch (error) {
        logger.error(error);
      }

      try {
        const storedAppearances = await readBuildCardAppearances();
        const next = normalizeAppearances(storedAppearances ?? legacyAppearances);
        if (active) setAppearances(next);

        if (legacyAppearances) {
          if (!storedAppearances) await writeBuildCardAppearances(next);
          window.localStorage.removeItem(LEGACY_BUILD_CARD_APPEARANCES_KEY);
        }
      } catch (error) {
        logger.error(error);
        if (active && legacyAppearances) setAppearances(legacyAppearances);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const persistAppearances = async (next: Record<string, BuildCardAppearance>) => {
    setAppearances(next);

    try {
      await writeBuildCardAppearances(next);
      window.localStorage.removeItem(LEGACY_BUILD_CARD_APPEARANCES_KEY);
    } catch (error) {
      // Appearance persistence must never prevent creating, downloading, or deleting a build.
      logger.error(error);
      try {
        window.localStorage.setItem(LEGACY_BUILD_CARD_APPEARANCES_KEY, JSON.stringify(next));
      } catch (fallbackError) {
        logger.error(fallbackError);
      }
    }
  };

  const getAppearance = (targetId: string | null | undefined) => {
    if (!targetId) return { ...DEFAULT_BUILD_CARD_APPEARANCE };
    return normalizeBuildCardAppearance(appearances[targetId]);
  };

  return { appearances, persistAppearances, getAppearance };
}
