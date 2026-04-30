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
  tagline: `Train your interview performance.
Upload your CV. Add the job spec.
Practise real interview questions.
Get clear, structured feedback.`,
} as const;

export type Brand = typeof BRAND;
