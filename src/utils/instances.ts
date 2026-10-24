import type { InstanceItem } from "../types";

function instanceCreatedTimestamp(instance: InstanceItem) {
  const parsed = Number(instance.createdAt);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function sortInstancesNewestFirst(instances: readonly InstanceItem[]) {
  // Builds are appended on creation; reverse also puts newer entries first when
  // timestamps share a second or older records have no creation timestamp.
  return [...instances]
    .reverse()
    .sort((a, b) => instanceCreatedTimestamp(b) - instanceCreatedTimestamp(a));
}

export function instanceLastPlayedTimestamp(instance: InstanceItem) {
  const parsed = Number.parseInt(instance.lastPlayed ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function pickPreferredInstance(instances: InstanceItem[], preferredId?: string | null) {
  if (instances.length === 0) return null;
  if (preferredId) {
    const preferred = instances.find((instance) => instance.id === preferredId);
    if (preferred) return preferred;
  }

  const played = [...instances]
    .filter((instance) => instanceLastPlayedTimestamp(instance) > 0)
    .sort((a, b) => instanceLastPlayedTimestamp(b) - instanceLastPlayedTimestamp(a));

  if (played[0]) return played[0];
  return instances[instances.length - 1] ?? instances[0] ?? null;
}
