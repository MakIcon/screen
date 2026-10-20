import { LOCALE_CHANGING_EVENT, LOCALE_STORAGE_KEY } from "./store";

const CONTROL = "button, a, select, summary, [role='tab'], [role='switch'], [role='menuitem']";
const EXCLUDED =
  "script, style, svg, canvas, textarea, [contenteditable], [hidden], [aria-hidden='true']";

/** A diagonal wave: nearby rows move together, from the upper left to the lower right. */
export function languageWaveDelay(
  { top, left }: Pick<DOMRect, "top" | "left">,
  { width, height }: { width: number; height: number },
): number {
  const progress = (position: number, size: number) =>
    Math.max(0, Math.min(1, position / Math.max(1, size)));
  return Math.round(progress(top, height) * 520 + progress(left, width) * 160);
}

const DURATION = 500;
const REVEAL_AT = 110;

/** Keep React's text node in place, and never overwrite a later render or a removed node. */
export function deferLanguageText(node: Pick<Text, "data" | "isConnected">, previous: string) {
  const next = node.data;
  if (next === previous || (!next.trim() && !previous.trim())) return;
  node.data = previous;
  return {
    previous,
    reveal: () => {
      if (node.isConnected && node.data === previous) node.data = next;
    },
  };
}

interface PendingChange {
  element: HTMLElement;
  reveal: () => void;
}

/** Runs only around a language change; ordinary renders never animate or get observed. */
export function installLanguageTransition(): () => void {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const animations = new Set<Animation>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const pending = new Set<PendingChange>();
  let observer: MutationObserver | undefined;
  let frame = 0;
  let nextFrame = 0;

  const cancel = (settle = true) => {
    observer?.disconnect();
    observer = undefined;
    window.cancelAnimationFrame(frame);
    window.cancelAnimationFrame(nextFrame);
    animations.forEach((animation) => animation.cancel());
    animations.clear();
    timers.forEach(clearTimeout);
    timers.clear();
    if (settle) pending.forEach((change) => change.reveal());
    pending.clear();
  };

  const begin = () => {
    // A new selection continues from the words currently visible on screen.
    // Its React commit will supersede every pending value from the previous locale.
    cancel(false);
    const root = document.body;
    if (
      !root ||
      motion.matches ||
      document.hidden ||
      document.documentElement.dataset.motion === "off" ||
      typeof HTMLElement.prototype.animate !== "function"
    )
      return;

    const textChanges = new Map<Text, ReturnType<typeof deferLanguageText> & PendingChange>();
    const attributeChanges = new Map<
      HTMLElement,
      Map<string, { previous: string | null } & PendingChange>
    >();
    const target = (element: HTMLElement | null) => {
      if (!element || element.closest(EXCLUDED)) return null;
      return element.closest<HTMLElement>(CONTROL) ?? element;
    };
    const stageText = (node: Text, previous: string) => {
      const element = target(node.parentElement);
      if (!element) return;
      const existing = textChanges.get(node);
      if (existing) pending.delete(existing);
      const deferred = deferLanguageText(node, existing?.previous ?? previous);
      if (!deferred) return;
      const change = { ...deferred, element };
      textChanges.set(node, change);
      pending.add(change);
    };
    const textNodes = (node: Node): Text[] => {
      if (node.nodeType === Node.TEXT_NODE) return [node as Text];
      const nodes: Text[] = [];
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      return nodes;
    };
    const options: MutationObserverInit = {
      subtree: true,
      characterData: true,
      characterDataOldValue: true,
      childList: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["placeholder", "title", "aria-label", "data-tooltip"],
    };
    const collect = (records: MutationRecord[]) => {
      // Our temporary old strings must not become another observed React update.
      observer?.disconnect();
      const replacements = new Map<Node, { previous: Text[]; next: Text[] }>();
      for (const record of records) {
        if (record.type === "characterData") {
          stageText(record.target as Text, record.oldValue ?? "");
        } else if (record.type === "childList") {
          const replacement = replacements.get(record.target) ?? { previous: [], next: [] };
          replacement.previous.push(...[...record.removedNodes].flatMap(textNodes));
          replacement.next.push(...[...record.addedNodes].flatMap(textNodes));
          replacements.set(record.target, replacement);
        } else if (record.target instanceof HTMLElement) {
          const element = record.target;
          const attribute = record.attributeName!;
          const next = element.getAttribute(attribute);
          if (record.oldValue === next) continue;
          // A translated placeholder or an icon-only control's tooltip also gets a pulse.
          // An entire card must not move just because its accessible name changed.
          if (
            (attribute === "placeholder" &&
              element instanceof HTMLInputElement &&
              !element.value) ||
            element.matches(CONTROL)
          ) {
            const attributes = attributeChanges.get(element) ?? new Map();
            attributeChanges.set(element, attributes);
            const existing = attributes.get(attribute);
            if (existing) pending.delete(existing);
            const previous = existing ? existing.previous : record.oldValue;
            if (previous === null) element.removeAttribute(attribute);
            else element.setAttribute(attribute, previous);
            const change = {
              element,
              previous,
              reveal: () => {
                if (!element.isConnected || element.getAttribute(attribute) !== previous) return;
                if (next === null) element.removeAttribute(attribute);
                else element.setAttribute(attribute, next);
              },
            };
            attributes.set(attribute, change);
            pending.add(change);
          }
        }
      }
      // React sometimes replaces a keyed subtree rather than editing its text nodes.
      // Pair equivalent text slots without reattaching or replacing React-owned DOM.
      for (const { previous, next } of replacements.values()) {
        if (previous.length !== next.length) continue;
        next.forEach((node, index) => stageText(node, previous[index].data));
      }
      observer?.observe(root, options);
    };

    observer = new MutationObserver(collect);
    observer.observe(root, options);

    // Leave React's external-store update and its layout effects time to commit.
    frame = window.requestAnimationFrame(() => {
      nextFrame = window.requestAnimationFrame(() => {
        if (!observer) return;
        collect(observer.takeRecords());
        observer.disconnect();
        observer = undefined;
        if (motion.matches || document.documentElement.dataset.motion === "off") {
          cancel();
          return;
        }

        const viewport = { width: window.innerWidth, height: window.innerHeight };
        const accent =
          getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() ||
          "#c2410c";
        const candidates = new Set([...pending].map((change) => change.element));
        const groups = new Map<HTMLElement, PendingChange[]>();
        for (const change of pending) {
          let element = change.element;
          for (let parent = element.parentElement; parent; parent = parent.parentElement)
            if (candidates.has(parent)) element = parent;
          const group = groups.get(element) ?? [];
          group.push(change);
          groups.set(element, group);
        }
        const targets = [...groups].map(([element, changes]) => ({
          element,
          changes,
          rect: element.getBoundingClientRect(),
          style: getComputedStyle(element),
        }));

        for (const { element, changes, rect, style } of targets) {
          const reveal = () => {
            changes.forEach((change) => {
              change.reveal();
              pending.delete(change);
            });
          };
          const visible =
            element.isConnected &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < viewport.height &&
            rect.left < viewport.width &&
            style.visibility !== "hidden" &&
            style.opacity !== "0";
          if (!visible) {
            reveal();
            continue;
          }
          const delay = languageWaveDelay(rect, viewport);
          const timer = setTimeout(() => {
            timers.delete(timer);
            reveal();
          }, delay + REVEAL_AT);
          timers.add(timer);
          const shadow = style.textShadow === "none" ? "" : `${style.textShadow}, `;
          const lift = style.translate === "none";
          const animation = element.animate(
            [
              {
                offset: 0,
                easing: "cubic-bezier(0.22, 0.7, 0.3, 1)",
                color: style.color,
                textShadow: style.textShadow,
                ...(lift && { translate: "0 0" }),
              },
              {
                offset: REVEAL_AT / DURATION,
                easing: "cubic-bezier(0.4, 0, 0.2, 1)",
                color: `color-mix(in srgb, ${style.color} 75%, ${accent})`,
                textShadow: `${shadow}0 0 12px color-mix(in srgb, ${accent} 45%, transparent)`,
                ...(lift && { translate: "0 -4px" }),
              },
              {
                offset: 0.65,
                easing: "ease-out",
                color: style.color,
                textShadow: `${shadow}0 0 5px color-mix(in srgb, ${accent} 18%, transparent)`,
                ...(lift && { translate: "0 1px" }),
              },
              {
                offset: 1,
                color: style.color,
                textShadow: style.textShadow,
                ...(lift && { translate: "0 0" }),
              },
            ],
            {
              duration: DURATION,
              delay,
              easing: "linear",
            },
          );
          animation.id = "language-wave";
          animations.add(animation);
          animation.onfinish = animation.oncancel = () => animations.delete(animation);
        }
      });
    });
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== LOCALE_STORAGE_KEY && event.key !== null) return;
    if ((event.oldValue === "en") !== (event.newValue === "en")) begin();
  };
  const onMotion = () => {
    if (motion.matches) cancel();
  };
  const onVisibility = () => {
    if (document.hidden) cancel();
  };
  window.addEventListener(LOCALE_CHANGING_EVENT, begin);
  // Capture runs before useSyncExternalStore's storage subscriptions in other windows.
  window.addEventListener("storage", onStorage, true);
  motion.addEventListener("change", onMotion);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    cancel();
    window.removeEventListener(LOCALE_CHANGING_EVENT, begin);
    window.removeEventListener("storage", onStorage, true);
    motion.removeEventListener("change", onMotion);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
