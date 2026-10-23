const OMIT = "canvas-ui-element, canvas-ui-capture, script, style, link";
const INTERNAL =
  /^(?:data-canvas-ui-|data-appearance-(?:target-id|override|component-settings|liquid-glass)$|data-config$)/;

/** Retain the mirror and patch real content changes. Pointer motion belongs to
 * the shader and must never rebuild a panel or its scrolling lists. */
export function observeCanvasUiElement(
  element: HTMLElement,
  content: HTMLElement,
  requestPaint: () => void,
) {
  const mirrors = new Map<Node, Node>();
  const declarations = new WeakMap<Element, string>();
  const pseudoRules = new Map<Element, string>();
  const keys = new WeakMap<Element, number>();
  const styleNodes = new Set<Element>();
  const subtrees = new Set<Element>();
  const structures = new Set<Node>();
  const textNodes = new Set<Node>();
  const controls = new Set<Element>();
  const scrollNodes = new Set<Element>();
  let nextKey = 0;
  let frame = 0;
  let disposed = false;
  let backdropDirty = true;
  let resized = true;
  let changed = false;
  const properties = Array.from(getComputedStyle(element)).filter((key) => !key.startsWith("--"));
  const pseudoStyle = document.createElement("style");
  const backdrop = document.createElement("div");
  Object.assign(backdrop.style, {
    position: "absolute",
    inset: "0",
    overflow: "hidden",
    pointerEvents: "none",
  });
  const ignored = (node: Node) =>
    (node instanceof Element ? node : node.parentElement)?.closest(OMIT);
  const relevant = (node: Node) => (node === element || element.contains(node)) && !ignored(node);

  const copyAttributes = (source: Element, clone: Element) => {
    for (const attribute of Array.from(clone.attributes)) {
      if (
        !["style", "data-canvas-mirror"].includes(attribute.name) &&
        !source.hasAttribute(attribute.name)
      ) {
        clone.removeAttribute(attribute.name);
        changed = true;
      }
    }
    for (const { name, value } of Array.from(source.attributes)) {
      if (
        ["id", "name", "autofocus", "style", "drawable"].includes(name) ||
        name.startsWith("on") ||
        INTERNAL.test(name)
      )
        continue;
      if (clone.getAttribute(name) !== value) {
        clone.setAttribute(name, value);
        changed = true;
      }
    }
    for (const name of ["id", "name", "autofocus", "drawable"]) clone.removeAttribute(name);
  };
  const snapshotStyle = (source: Element) => {
    const clone = mirrors.get(source);
    if (!(clone instanceof Element)) return false;
    const computed = getComputedStyle(source);
    const css = properties.map((key) => `${key}:${computed.getPropertyValue(key)};`).join("");
    if (declarations.get(source) === css) return false;
    declarations.set(source, css);
    clone.setAttribute("style", css);
    if (source === element && clone instanceof HTMLElement)
      Object.assign(clone.style, {
        position: "relative",
        inset: "auto",
        margin: "0",
        transform: "none",
        translate: "none",
        rotate: "none",
        scale: "none",
        opacity: "1",
        width: `${element.offsetWidth}px`,
        height: `${element.offsetHeight}px`,
        minWidth: "0",
        minHeight: "0",
        maxWidth: "none",
        maxHeight: "none",
        boxSizing: "border-box",
        animation: "none",
        transition: "none",
        zIndex: "1",
        ...(computed.display === "inline" ? { display: "block" } : {}),
      });
    let rules = "";
    for (const pseudo of ["::before", "::after"]) {
      const style = getComputedStyle(source, pseudo);
      if (!style.content || ["none", "normal"].includes(style.content)) continue;
      rules += `[data-canvas-mirror="${keys.get(source)}"]${pseudo}{${properties.map((property) => `${property}:${style.getPropertyValue(property)};`).join("")}}`;
    }
    if (rules) pseudoRules.set(source, rules);
    else pseudoRules.delete(source);
    changed = true;
    return true;
  };
  const copyControl = (source: Element) => {
    const clone = mirrors.get(source);
    if (source instanceof HTMLInputElement && clone instanceof HTMLInputElement) {
      if (clone.value !== source.value) {
        clone.value = source.value;
        changed = true;
      }
      if (clone.checked !== source.checked) {
        clone.checked = source.checked;
        changed = true;
      }
    }
    if (
      source instanceof HTMLTextAreaElement &&
      clone instanceof HTMLTextAreaElement &&
      clone.value !== source.value
    ) {
      clone.value = source.value;
      changed = true;
    }
    if (
      source instanceof HTMLSelectElement &&
      clone instanceof HTMLSelectElement &&
      clone.selectedIndex !== source.selectedIndex
    ) {
      clone.selectedIndex = source.selectedIndex;
      changed = true;
    }
    if (source instanceof HTMLCanvasElement && clone instanceof HTMLCanvasElement) {
      if (clone.width !== source.width) clone.width = source.width;
      if (clone.height !== source.height) clone.height = source.height;
      try {
        clone.getContext("2d")?.drawImage(source, 0, 0);
        changed = true;
      } catch {
        /* Detached GPU frame. */
      }
    }
  };
  const create = (source: Node): Node | null => {
    if (ignored(source)) return null;
    const clone = source.cloneNode(false);
    mirrors.set(source, clone);
    if (source instanceof Element && clone instanceof Element) {
      // Shallow clones still carry attributes. Strip runtime bindings as well as
      // identifiers before adding the mirror's own stable lookup key.
      for (const { name } of Array.from(clone.attributes))
        if (name.startsWith("on") || INTERNAL.test(name)) clone.removeAttribute(name);
      keys.set(source, nextKey++);
      clone.setAttribute("data-canvas-mirror", String(keys.get(source)));
      copyAttributes(source, clone);
      snapshotStyle(source);
      for (const child of Array.from(source.childNodes)) {
        const copy = create(child);
        if (copy) clone.appendChild(copy);
      }
      copyControl(source);
      scrollNodes.add(source);
    }
    return clone;
  };
  const forget = (node: Node) => {
    for (const child of Array.from(node.childNodes)) forget(child);
    mirrors.delete(node);
    if (node instanceof Element) pseudoRules.delete(node);
  };
  const reconcile = (source: Node) => {
    const clone = mirrors.get(source);
    if (!clone) return;
    const children = Array.from(source.childNodes)
      .filter((child) => !ignored(child))
      .map((child) => mirrors.get(child) ?? create(child))
      .filter((child): child is Node => !!child);
    let cursor = clone.firstChild;
    for (const child of children) {
      if (child !== cursor) {
        clone.insertBefore(child, cursor);
        changed = true;
      }
      cursor = child.nextSibling;
    }
    while (cursor) {
      const next = cursor.nextSibling;
      clone.removeChild(cursor);
      cursor = next;
      changed = true;
    }
  };
  const snapshotSubtree = (root: Element) => {
    snapshotStyle(root);
    for (const child of root.querySelectorAll("*")) if (mirrors.has(child)) snapshotStyle(child);
  };
  const updateBackdrop = () => {
    // Refraction shaders sample RGB even for transparent texels. Reconstruct
    // ancestor backgrounds so transparent containers do not refract as black.
    const rect = element.getBoundingClientRect();
    const scaleX = rect.width / (element.offsetWidth || 1) || 1;
    const scaleY = rect.height / (element.offsetHeight || 1) || 1;
    const parents: HTMLElement[] = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement)
      parents.unshift(parent);
    const layers: HTMLElement[] = [];
    backdrop.style.backgroundColor =
      getComputedStyle(element).getPropertyValue("--bg").trim() || "#ffffff";
    for (const parent of parents) {
      const style = getComputedStyle(parent);
      if (
        style.backgroundImage === "none" &&
        ["transparent", "rgba(0, 0, 0, 0)"].includes(style.backgroundColor)
      )
        continue;
      const bounds = parent.getBoundingClientRect();
      const layer = document.createElement("div");
      Object.assign(layer.style, {
        position: "absolute",
        left: `${(bounds.left - rect.left) / scaleX}px`,
        top: `${(bounds.top - rect.top) / scaleY}px`,
        width: `${bounds.width / scaleX}px`,
        height: `${bounds.height / scaleY}px`,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        backgroundPosition: style.backgroundPosition,
        backgroundSize: style.backgroundSize,
        backgroundRepeat: style.backgroundRepeat,
        backgroundOrigin: style.backgroundOrigin,
        backgroundClip: style.backgroundClip,
        borderRadius: style.borderRadius,
      });
      layers.push(layer);
    }
    backdrop.replaceChildren(...layers);
    changed = true;
  };
  const update = () => {
    frame = 0;
    if (disposed || !element.isConnected) return;
    for (const node of structures) if (relevant(node)) reconcile(node);
    if (structures.size)
      for (const [original] of mirrors)
        if (original !== element && !element.contains(original)) forget(original);
    for (const node of textNodes) {
      const clone = mirrors.get(node);
      if (clone && clone.nodeValue !== node.nodeValue) {
        clone.nodeValue = node.nodeValue;
        changed = true;
      }
    }
    for (const node of subtrees) if (relevant(node)) snapshotSubtree(node);
    for (const node of styleNodes)
      if (relevant(node)) {
        if (snapshotStyle(node))
          for (const child of node.querySelectorAll("*"))
            if (mirrors.has(child)) snapshotStyle(child);
      }
    for (const node of controls) copyControl(node);
    if (resized) {
      declarations.delete(element);
      snapshotStyle(element);
      resized = false;
      backdropDirty = true;
    }
    if (backdropDirty) {
      updateBackdrop();
      backdropDirty = false;
    }
    for (const source of scrollNodes) {
      const clone = mirrors.get(source);
      if (
        clone instanceof Element &&
        (clone.scrollTop !== source.scrollTop || clone.scrollLeft !== source.scrollLeft)
      ) {
        clone.scrollTop = source.scrollTop;
        clone.scrollLeft = source.scrollLeft;
        changed = true;
      }
    }
    const css = [...pseudoRules.values()].join("\n") + "\n*::-webkit-scrollbar{display:none}";
    if (pseudoStyle.textContent !== css) {
      pseudoStyle.textContent = css;
      changed = true;
    }
    structures.clear();
    textNodes.clear();
    subtrees.clear();
    styleNodes.clear();
    controls.clear();
    scrollNodes.clear();
    if (changed) {
      changed = false;
      requestPaint();
    }
  };
  const schedule = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(update);
  };
  const mirror = create(element)!;
  content.replaceChildren(backdrop, pseudoStyle, mirror);
  update();
  const stylePath = (node: Node) => {
    for (
      let current = node instanceof Element ? node : node.parentElement;
      current;
      current = current.parentElement
    ) {
      styleNodes.add(current);
      if (current === element) break;
    }
  };
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      if (!relevant(record.target)) continue;
      if (record.type === "childList") {
        structures.add(record.target);
        stylePath(record.target);
      } else if (record.type === "characterData") {
        textNodes.add(record.target);
        stylePath(record.target);
      } else if (record.target instanceof Element) {
        const attribute = record.attributeName!;
        if (INTERNAL.test(attribute) || record.oldValue === record.target.getAttribute(attribute))
          continue;
        const clone = mirrors.get(record.target);
        if (clone instanceof Element) copyAttributes(record.target, clone);
        subtrees.add(record.target);
        controls.add(record.target);
        stylePath(record.target);
      }
    }
    if (structures.size || textNodes.size || subtrees.size) schedule();
  });
  mutations.observe(element, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeOldValue: true,
  });
  const resize = new ResizeObserver(() => {
    resized = true;
    subtrees.add(element);
    schedule();
  });
  resize.observe(element);
  const ancestors = new MutationObserver((records) => {
    if (
      records.every(
        (record) =>
          record.type === "attributes" &&
          record.target instanceof Element &&
          record.oldValue === record.target.getAttribute(record.attributeName!),
      )
    )
      return;
    backdropDirty = true;
    subtrees.add(element);
    schedule();
  });
  for (let parent = element.parentElement; parent; parent = parent.parentElement)
    ancestors.observe(parent, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["class", "style", "data-theme", "data-appearance-custom"],
    });
  ancestors.observe(document.head, { childList: true, characterData: true, subtree: true });
  const onState = (event: Event) => {
    if (!(event.target instanceof Element) || !relevant(event.target)) return;
    stylePath(event.target);
    controls.add(event.target);
    schedule();
  };
  const onScroll = (event: Event) => {
    if (event.target instanceof Element && relevant(event.target)) {
      scrollNodes.add(event.target);
      schedule();
    }
  };
  const events = [
    "input",
    "change",
    "pointerover",
    "pointerout",
    "pointerdown",
    "pointerup",
    "focusin",
    "focusout",
    "load",
    "transitionend",
    "animationend",
  ];
  events.forEach((type) => element.addEventListener(type, onState, true));
  element.addEventListener("scroll", onScroll, true);
  const onAncestorScroll = (event: Event) => {
    if (
      event.target instanceof Element &&
      event.target !== element &&
      event.target.contains(element)
    ) {
      backdropDirty = true;
      schedule();
    }
  };
  window.addEventListener("scroll", onAncestorScroll, true);
  void document.fonts.ready.then(() => {
    if (!disposed) {
      subtrees.add(element);
      schedule();
    }
  });
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    mutations.disconnect();
    resize.disconnect();
    ancestors.disconnect();
    events.forEach((type) => element.removeEventListener(type, onState, true));
    element.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("scroll", onAncestorScroll, true);
    mirrors.clear();
    pseudoRules.clear();
  };
}
