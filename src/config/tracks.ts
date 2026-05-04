// Interview tracks for iPrpr. Default is `professional` so existing flows
// remain unchanged. Track names are deliberately stable strings.

export type InterviewTrack = "professional" | "academic" | "graduate" | "media";

export const INTERVIEW_TRACKS: Array<{
  value: InterviewTrack;
  label: string;
  shortLabel: string;
  blurb: string;
  description: string;
}> = [
  {
    value: "professional",
    label: "iPrpr: Professional",
    shortLabel: "Professional",
    blurb: "Professional job interviews across industries.",
    description: "Standard professional interview preparation.",
  },
  {
    value: "graduate",
    label: "iPrpr: Graduate",
    shortLabel: "Graduate",
    blurb: "Graduate schemes and early-career roles.",
    description:
      "Build clear answers around potential, experience, judgement and fit.",
  },
  {
    value: "academic",
    label: "iPrpr: Academic",
    shortLabel: "Academic",
    blurb: "From 7+ entry to Oxford and the Ivy League.",
    description:
      "Admissions prep calibrated to your age group — prep school, grammar, independent, sixth form, Russell Group, and Ivy League. Questions adjust to your subject, institution, and developmental stage.",
  },
  {
    value: "media",
    label: "iPrpr: Media",
    shortLabel: "Media",
    blurb: "Podcast, broadcast, and press interviews.",
    description:
      "Practise clear, quotable answers that hold attention and land under pressure.",
  },
];

export const TRACK_LABELS: Record<InterviewTrack, string> = {
  professional: "iPrpr: Professional",
  academic: "iPrpr: Academic",
  graduate: "iPrpr: Graduate",
  media: "iPrpr: Media",
};

export function trackLabel(track: string | null | undefined): string {
  if (!track) return TRACK_LABELS.professional;
  return TRACK_LABELS[track as InterviewTrack] ?? TRACK_LABELS.professional;
}

// Track-specific guidance injected into the generation prompt. Keep these
// concise — they augment, not replace, the core interview-coach prompt.
export const TRACK_PROMPT_GUIDANCE: Record<InterviewTrack, string> = {
  professional: `
Focus on structured, competency-based responses.
Prioritise clarity, outcomes, and commercial awareness.
`,

  academic: `
Focus on intellectual curiosity, subject depth, and reflective thinking.
Include reasoning, motivation, and academic engagement.
`,

  graduate: `
Focus on potential, learning agility, and transferable skills.
Balance structure with personality and coachability.
`,

  media: `
Focus on clarity under pressure, brevity, and audience engagement.
Encourage strong hooks, quotable lines, and controlled delivery.
`,
};
