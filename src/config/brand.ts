/**
 * Single source of truth for the app's brand identity.
 *
 * All UI must reference BRAND.appName / BRAND.fullName.
 * Do NOT hardcode the app name elsewhere.
 */
export const BRAND = {
  appName: "iPrpr",
  fullName: "iPrpr by The Speech Coach",
  shortName: "iPrpr",
  supportEmail: "support@thespeech.coach",
  line: "Aim. Prepare. Land.",
  subline: "Interview training that builds real performance.",
  tagline: `Your profile. Your target. Fifty questions built for both. Feedback on how you actually perform.`,
} as const;

export type Brand = typeof BRAND;
