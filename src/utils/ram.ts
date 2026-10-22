export const BYTES_PER_GIB = 1024 ** 3;

/** Display is separate from the raw capacity used by heap limits. */
export function formatSystemRamGb(systemRamGb: number) {
  if (!Number.isFinite(systemRamGb) || systemRamGb < 0) return "0";
  return String(Math.floor(systemRamGb * 10) / 10);
}

export function getMinecraftRamMax(systemRamGb: number) {
  return Number.isFinite(systemRamGb) ? Math.max(1, Math.floor(systemRamGb)) : 1;
}

export function clampRamToSystem(ram: number, systemRamGb: number) {
  const requested = Number.isFinite(ram) ? Math.floor(ram) : 1;
  return Math.min(Math.max(requested, 1), getMinecraftRamMax(systemRamGb));
}

export function exceedsUsableRam(ramGb: number, usableRamGb: number | null) {
  return (
    usableRamGb !== null &&
    Number.isFinite(usableRamGb) &&
    usableRamGb > 0 &&
    Number.isFinite(ramGb) &&
    ramGb > usableRamGb
  );
}

export function getRamWarningLevel(
  ramGb: number,
  usableRamGb: number | null,
  systemRamGb: number,
): 0 | 1 | 2 | 3 {
  if (usableRamGb === null || !exceedsUsableRam(ramGb, usableRamGb)) return 0;
  const maxRamGb = getMinecraftRamMax(systemRamGb);
  if (ramGb >= maxRamGb) return 3;
  const firstWarningRamGb = Math.floor(usableRamGb) + 1;
  const progress = (ramGb - firstWarningRamGb) / Math.max(1, maxRamGb - firstWarningRamGb);
  return Math.min(2, Math.max(1, 1 + Math.floor(progress * 2))) as 1 | 2;
}

export function getRamSliderTicks(systemRamGb: number) {
  const maxRamGb = getMinecraftRamMax(systemRamGb);

  return Array.from(
    new Set([
      1,
      Math.max(1, Math.floor(maxRamGb / 3)),
      Math.max(1, Math.floor((maxRamGb / 3) * 2)),
      maxRamGb,
    ]),
  ).sort((a, b) => a - b);
}
