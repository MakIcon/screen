import { CANVAS_UI_CAPTURE_IGNORE_SELECTOR, CANVAS_UI_REPLACED_ATTRIBUTE } from "./canvasUiRuntime";

const OMIT_ATTRIBUTES = new Set([
  "id",
  "style",
  "data-appearance-override",
  "data-appearance-target-id",
  CANVAS_UI_REPLACED_ATTRIBUTE,
]);
const INTERACTION = /:(?:hover|active|focus|focus-visible|focus-within|checked|disabled)\b/;

// State selectors can also style descendants (for example button:hover svg).
// Refresh only the properties used by those rules, rather than serializing
// every computed property of every descendant whenever the pointer moves.
function interactionProperties() {
  const properties = new Set<string>();
  const collect = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule && INTERACTION.test(rule.selectorText)) {
        for (const property of rule.style) properties.add(property);
      }
      if ("cssRules" in rule) collect((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      collect(sheet.cssRules);
    } catch {
      // Cross-origin stylesheets do not expose their rules.
    }
  }
  return properties;
}

export function createCanvasUiElementMirror(target: HTMLElement, host: HTMLElement) {
  const copies = new WeakMap<Node, Node>();
  const styles = new Set<Element>();
  const stateRoots = new Set<Element>();
  const subtrees = new Set<Element>();
  const structures = new Set<Node>();
  let stateProperties = interactionProperties();

  const copyState = (original: Element, copy: Element) => {
    if (original instanceof HTMLInputElement && copy instanceof HTMLInputElement) {
      copy.value = original.value;
      copy.checked = original.checked;
    } else if (original instanceof HTMLTextAreaElement && copy instanceof HTMLTextAreaElement) {
      copy.value = original.value;
    } else if (original instanceof HTMLSelectElement && copy instanceof HTMLSelectElement) {
      copy.selectedIndex = original.selectedIndex;
    } else if (original instanceof HTMLCanvasElement && copy instanceof HTMLCanvasElement) {
      copy.getContext("2d")?.drawImage(original, 0, 0);
    }
    copy.scrollLeft = original.scrollLeft;
    copy.scrollTop = original.scrollTop;
  };
  const copyStyle = (original: Element, properties?: Set<string>) => {
    const copy = copies.get(original) as HTMLElement | undefined;
    if (!copy?.style) return () => {};
    const computed = getComputedStyle(original);
    const values = Array.from(
      properties ?? computed,
      (property) => [property, computed.getPropertyValue(property)] as const,
    );
    return () => {
      if (properties) {
        for (const [property, value] of values) {
          if (property === "-webkit-text-fill-color" || property === "-webkit-text-stroke-color")
            continue;
          if (copy.style.getPropertyValue(property) !== value)
            copy.style.setProperty(property, value);
        }
      } else {
        copy.style.cssText = values.map(([property, value]) => `${property}:${value};`).join("");
        copy.style.removeProperty("-webkit-text-fill-color");
        copy.style.removeProperty("-webkit-text-stroke-color");
      }
      if (original === target)
        Object.assign(copy.style, {
          position: "relative",
          inset: "auto",
          margin: "0",
          transform: "none",
          width: "100%",
          height: "100%",
          minWidth: "0",
          minHeight: "0",
        });
    };
  };
  const attributes = (original: Element, copy: Element) => {
    for (const attribute of [...copy.attributes]) {
      if (OMIT_ATTRIBUTES.has(attribute.name) || !original.hasAttribute(attribute.name))
        copy.removeAttribute(attribute.name);
    }
    for (const attribute of original.attributes) {
      if (
        !OMIT_ATTRIBUTES.has(attribute.name) &&
        copy.getAttribute(attribute.name) !== attribute.value
      )
        copy.setAttribute(attribute.name, attribute.value);
    }
    copy.classList.remove("appearance-pick-selected", "appearance-pick-target");
  };
  const clone = (original: Node): Node | null => {
    if (original instanceof Element && original.matches(CANVAS_UI_CAPTURE_IGNORE_SELECTOR))
      return null;
    const copy = original.cloneNode(false);
    copies.set(original, copy);
    if (original instanceof Element && copy instanceof Element) attributes(original, copy);
    for (const child of original.childNodes) {
      const childCopy = clone(child);
      if (childCopy) copy.appendChild(childCopy);
    }
    if (original instanceof Element) styles.add(original);
    return copy;
  };
  const initial = clone(target);
  if (initial) host.replaceChildren(initial);

  return {
    refresh() {
      stateProperties = interactionProperties();
      subtrees.add(target);
    },
    resize() {
      subtrees.add(target);
    },
    state(node: Element, related: EventTarget | null = null) {
      let current: Element | null = node;
      while (current && target.contains(current)) {
        // A shared ancestor remains hovered/focused when moving between its children.
        if (related instanceof Node && current.contains(related)) break;
        styles.add(current);
        stateRoots.add(current);
        current = current.parentElement;
      }
    },
    value(node: Element) {
      const copy = copies.get(node);
      if (copy instanceof Element) copyState(node, copy);
    },
    mutation(record: MutationRecord) {
      if (!target.contains(record.target)) {
        subtrees.add(target);
      } else if (record.type === "childList") {
        structures.add(record.target);
      } else if (record.type === "characterData") {
        const copy = copies.get(record.target);
        if (copy) copy.nodeValue = record.target.nodeValue;
      } else if (record.target instanceof Element) {
        const copy = copies.get(record.target);
        if (copy instanceof Element) attributes(record.target, copy);
        subtrees.add(record.target);
      }
    },
    flush() {
      for (const original of structures) {
        const copy = copies.get(original);
        if (!copy) continue;
        const children: Node[] = [];
        for (const child of original.childNodes) {
          const childCopy = copies.get(child) ?? clone(child);
          if (childCopy) children.push(childCopy);
        }
        // Keep existing nodes, input state and running native animations intact.
        for (const child of [...copy.childNodes])
          if (!children.includes(child)) copy.removeChild(child);
        children.forEach((child, index) => {
          if (copy.childNodes[index] !== child)
            copy.insertBefore(child, copy.childNodes[index] ?? null);
        });
        if (original instanceof Element) subtrees.add(original);
      }
      structures.clear();
      for (const root of subtrees) {
        styles.add(root);
        for (const node of root.querySelectorAll("*")) styles.add(node);
      }
      subtrees.clear();
      const stateNodes = new Set<Element>();
      for (const root of stateRoots)
        for (const node of root.querySelectorAll("*")) stateNodes.add(node);
      stateRoots.clear();
      const updates: (() => void)[] = [];
      const originals = new Set<Element>();
      for (const original of styles)
        if (target.contains(original)) {
          updates.push(copyStyle(original));
          originals.add(original);
        }
      for (const original of stateNodes)
        if (!styles.has(original) && target.contains(original)) {
          updates.push(copyStyle(original, stateProperties));
          originals.add(original);
        }
      // Read source styles before writing mirror styles. Interleaving them,
      // especially scroll writes, forces layout once per copied element.
      updates.forEach((update) => update());
      for (const original of originals) {
        const copy = copies.get(original);
        if (copy instanceof Element) copyState(original, copy);
      }
      styles.clear();
    },
    destroy() {
      host.replaceChildren();
    },
  };
}
