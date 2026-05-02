// Interview tracks for iPrpr. Default is `professional` so existing flows
// remain unchanged. Track names are deliberately stable strings.

export type InterviewTrack = "professional" | "scholar" | "grad" | "media";

export const INTERVIEW_TRACKS: Array<{
  value: InterviewTrack;
  label: string;
  shortLabel: string;
  blurb: string;
  description: string;
}> = [
  {
    value: "professional",
    label: "Professional interview",
    shortLabel: "Professional",
    blurb: "Standard professional interview preparation.",
    description: "Standard professional interview preparation.",
  },
  {
    value: "scholar",
    label: "iPrpr: Scholar",
    shortLabel: "iPrpr: Scholar",
    blurb: "Admissions, scholarship and academic interviews.",
    description:
      "Prepare to explain your thinking, motivation, subject interest and intellectual curiosity.",
  },
  {
    value: "grad",
    label: "iPrpr: Grad",
    shortLabel: "iPrpr: Grad",
    blurb: "Graduate schemes, internships and first professional roles.",
    description:
      "Build clear answers around potential, experience, judgement and fit.",
  },
  {
    value: "media",
    label: "iPrpr: Media",
    shortLabel: "iPrpr: Media",
    blurb: "Podcast, broadcast and public-facing interviews.",
    description:
      "Practise clear, quotable answers that hold attention and land under pressure.",
  },
];

export const TRACK_LABELS: Record<InterviewTrack, string> = {
  professional: "Professional",
  scholar: "iPrpr: Scholar",
  grad: "iPrpr: Grad",
  media: "iPrpr: Media",
};

export function trackLabel(track: string | null | undefined): string {
  if (!track) return TRACK_LABELS.professional;
  return TRACK_LABELS[track as InterviewTrack] ?? TRACK_LABELS.professional;
}

// Track-specific guidance injected into the generation prompt. Keep these
// concise — they augment, not replace, the core interview-coach prompt.
export const TRACK_PROMPT_GUIDANCE: Record<InterviewTrack, string> = {
  professional:
    "TRACK: Professional interview. Standard professional interview preparation.",
  scholar:
    "TRACK: iPrpr: Scholar (academic / admissions / scholarship / fellowship). Focus on motivation, subject knowledge, intellectual curiosity, academic judgement, values, resilience and the candidate's ability to think aloud. Questions should probe how the candidate reasons, where their interest comes from, and how they handle ideas under scrutiny — not professional career outcomes.",
  grad:
    "TRACK: iPrpr: Grad (graduate scheme / internship / early-career). Focus on potential, transferable skills, career motivation, teamwork, initiative, judgement, communication and learning agility. Calibrate examples to early-career evidence (university projects, internships, part-time work, societies). Avoid assuming senior leadership experience.",
  media:
    "TRACK: iPrpr: Media (podcast / broadcast / panel / press / public-facing). Focus on clarity, brevity, audience awareness, message control, quotable answers, handling pressure, avoiding rambling and staying on point. Questions should mirror what a journalist, host or panel chair would actually ask. Coaching should reward tight, headline-ready delivery.",
};
