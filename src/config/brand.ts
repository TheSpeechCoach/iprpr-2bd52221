/**
 * Single source of truth for the app's brand identity.
 *
 * All UI must reference BRAND.appName / BRAND.fullName.
 * Do NOT hardcode the app name elsewhere.
 */
export const BRAND = {
  appName: "iPrpr-50",
  fullName: "iPrpr-50 by The Speech Coach",
  shortName: "iPrpr-50",
  supportEmail: "support@thespeech.coach",
} as const;

export type Brand = typeof BRAND;
