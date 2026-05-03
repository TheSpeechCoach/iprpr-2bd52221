// Track-specific guidance injected into the generation prompt.
// Mirror of src/config/tracks.ts (edge functions cannot import from src/).

export type InterviewTrack = "professional" | "academic" | "graduate" | "media";

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

export function normaliseTrack(value: unknown): InterviewTrack {
  if (value === "academic" || value === "graduate" || value === "media") return value;
  // Back-compat: accept legacy IDs in case any in-flight payloads still use them.
  if (value === "scholar") return "academic";
  if (value === "grad") return "graduate";
  return "professional";
}
