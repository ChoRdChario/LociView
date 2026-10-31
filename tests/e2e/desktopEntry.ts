/** The tracked Desktop runner supplies an owned loopback origin per run. */
export const desktopEntry = process.env.LOCIVIEW_E2E_ENTRY!;
export const desktopOrigin = new URL(desktopEntry).origin;
