// Track-specific guidance injected into the generation prompt.
// Mirror of src/config/tracks.ts (edge functions cannot import from src/).

export type InterviewTrack = "professional" | "scholar" | "grad" | "media";

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

export function normaliseTrack(value: unknown): InterviewTrack {
  if (value === "scholar" || value === "grad" || value === "media") return value;
  return "professional";
}
