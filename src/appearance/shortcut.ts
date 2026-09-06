type AppearanceStudioShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "metaKey" | "shiftKey"
>;

export function isAppearanceStudioShortcut(event: AppearanceStudioShortcutEvent) {
  return (
    event.code === "KeyA" && event.shiftKey && !event.altKey && (event.ctrlKey || event.metaKey)
  );
}
