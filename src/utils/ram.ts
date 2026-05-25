export function getMinecraftRamMax(systemRamGb: number) {
  return Math.max(1, Math.floor(systemRamGb));
}

export function clampRamToSystem(ram: number, systemRamGb: number) {
  return Math.min(Math.max(ram, 1), getMinecraftRamMax(systemRamGb));
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
