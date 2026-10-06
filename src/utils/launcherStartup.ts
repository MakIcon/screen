/** Apply independent startup values as soon as they arrive, even if another request fails. */
export async function loadStartupValue<T>(
  load: () => Promise<T>,
  apply: (value: T) => void,
  onError: (error: unknown) => void,
  isActive: () => boolean,
): Promise<void> {
  try {
    const value = await load();
    if (isActive()) apply(value);
  } catch (error) {
    if (isActive()) onError(error);
  }
}
