import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { logger } from "../utils/logger";

export type ContentIconKind = "mods" | "shaders" | "resourcePacks";
export type ContentIconCandidate = { title: string; kind: ContentIconKind };

export function contentIconKey(item: ContentIconCandidate) {
  const filename = item.title.replace(/\\/g, "/").split("/").pop() ?? item.title;
  return `${item.kind}:${filename.toLowerCase()}`;
}

export function useContentIcons() {
  const [icons, setIcons] = useState<Record<string, string | null>>({});
  const requested = useRef(new Set<string>());

  const requestIcons = useCallback(async (items: ContentIconCandidate[]) => {
    const pending = items
      .filter((item) => /\.(jar|zip)(\.disabled)?$/i.test(item.title))
      .map((item) => ({ ...item, key: contentIconKey(item) }))
      .filter(
        (item, index, all) =>
          !requested.current.has(item.key) &&
          all.findIndex((other) => other.key === item.key) === index,
      );
    if (!pending.length) return;
    for (const item of pending) requested.current.add(item.key);
    for (let offset = 0; offset < pending.length; offset += 50) {
      const batch = pending.slice(offset, offset + 50);
      try {
        const result = await invoke<Record<string, string | null>>(
          "resolve_modrinth_content_icons",
          {
            requests: batch,
          },
        );
        setIcons((current) => ({ ...current, ...result }));
      } catch (error) {
        logger.error("resolve_modrinth_content_icons failed", error);
        for (const item of batch) requested.current.delete(item.key);
      }
    }
  }, []);

  const getIconUrl = (item: ContentIconCandidate) => icons[contentIconKey(item)] ?? null;
  return { requestIcons, getIconUrl };
}
