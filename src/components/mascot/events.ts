export const MASCOT_FAKE_DELETE_EVENT = "launcher-mascot-fake-delete";
export const MASCOT_FAKE_CONTENT_DELETE_EVENT = "launcher-mascot-fake-content-delete";
export const MASCOT_FAKE_RESTORE_EVENT = "launcher-mascot-fake-restore";
/**
 * The mascot playing with the RAM slider: `ramGb` changes only the on-screen draft, never the
 * saved setting, and `null` puts the saved value back.
 */
export const MASCOT_RAM_PRANK_EVENT = "launcher-mascot-ram-prank";
export type MascotRamPrankDetail = { ramGb: number | null };
