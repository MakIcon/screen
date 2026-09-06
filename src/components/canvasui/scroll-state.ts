/** Track the actual scroller even when a canvas wraps a nested launcher layout. */
export function createScrollState(content: HTMLElement, onChange: () => void) {
  let current = content;
  const scrollable = (node: HTMLElement) =>
    node.scrollHeight > node.clientHeight + 1 &&
    /auto|scroll/.test(getComputedStyle(node).overflowY);
  if (!scrollable(current)) {
    const nested = Array.from(content.querySelectorAll<HTMLElement>("*")).find(scrollable);
    if (nested) current = nested;
    else {
      let ancestor = content.parentElement;
      while (ancestor) {
        if (scrollable(ancestor)) {
          current = ancestor;
          break;
        }
        ancestor = ancestor.parentElement;
      }
    }
  }
  const onScroll = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !(content.contains(target) || target.contains(content)))
      return;
    current = target;
    onChange();
  };
  document.addEventListener("scroll", onScroll, true);
  return {
    get current() {
      return current;
    },
    destroy() {
      document.removeEventListener("scroll", onScroll, true);
    },
  };
}
