export type BlockCoordinates = { x: number; y: number; z: number };

export function formatBlockCoordinates(position?: BlockCoordinates | null) {
  return position ? `${position.x} ${position.y} ${position.z}` : "";
}

export function parseBlockCoordinates(value: string): BlockCoordinates | null {
  const parts = value.trim().split(/[\s,;]+/);
  if (parts.length !== 3 || !parts.every((part) => /^-?\d+(?:\.\d+)?$/.test(part))) return null;
  const [x, y, z] = parts.map((part) => Math.floor(Number(part)));
  return [x, y, z].every(Number.isSafeInteger) ? { x, y, z } : null;
}

export function gatheringAreaPreview(first: string, second: string) {
  const a = parseBlockCoordinates(first),
    b = parseBlockCoordinates(second);
  if (!a || !b) return null;
  const size = {
    x: Math.abs(a.x - b.x) + 1,
    y: Math.abs(a.y - b.y) + 1,
    z: Math.abs(a.z - b.z) + 1,
  };
  const volume = size.x * size.y * size.z;
  return { size, volume, valid: Number.isSafeInteger(volume) && volume <= 32768 };
}
