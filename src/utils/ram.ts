export function clampRamToSystem(ram: number, systemRamGb: number) {
  return Math.min(Math.max(ram, 1), Math.max(1, systemRamGb));
}
