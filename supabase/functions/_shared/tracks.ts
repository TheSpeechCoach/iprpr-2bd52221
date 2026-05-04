// Track-specific guidance injected into the generation prompt.
// Mirror of src/config/tracks.ts (edge functions cannot import from src/).

export type InterviewTrack = "professional" | "academic" | "graduate" | "media";

export const TRACK_PROMPT_GUIDANCE: Record<InterviewTrack, string> = {
  professional: `
Focus on structured, competency-based responses.
Prioritise clarity, outcomes, and commercial awareness.
`,

  academic: `
ACADEMIC INTERVIEW TRACK — READ THIS CAREFULLY BEFORE GENERATING QUESTIONS.

This track covers entrance and admissions interviews for academic institutions — from age 7 through to undergraduate level, across the full spectrum: prep schools, primary schools (7+ and 8+), junior schools, senior schools (11+, 13+, 16+), sixth-form colleges, grammar schools, independent schools (including top-tier UK independents: Eton, Harrow, Winchester, Westminster, St Paul's, Wycombe Abbey, Cheltenham Ladies' College, Rugby, Sherborne and equivalents), state schools, grammar schools, Russell Group universities (Oxford, Cambridge, Imperial, LSE, UCL, Edinburgh, Manchester, Bristol, Warwick, KCL and equivalents), and Ivy League/elite US universities (Harvard, Yale, Princeton, MIT, Columbia, Penn, Dartmouth, Brown, Cornell and equivalents).

CRITICAL — AGE CALIBRATION: Read the candidate's age and seniority level carefully before generating. Adjust every question — vocabulary, concept depth, emotional register, and expectation of self-awareness — to the developmental stage:

- Age 7–9 (7+/8+): Questions are conversational and exploratory. Use simple, warm, direct language. Ask about books, hobbies, curiosity, favourite subjects, what they find interesting or puzzling. No abstract reasoning required. No "why this institution" pressure. Focus: engagement, enthusiasm, communication, listening.

- Age 10–11 (10+/11+): Slightly more structured. Introduce light reasoning ("What would you do if…"), favourite subjects with a reason, simple current events they might know. Begin asking about reading habits. Still warm and encouraging in framing. Focus: natural curiosity, subject enthusiasm, communication, simple reasoning.

- Age 12–13 (12+/13+): Introduce subject knowledge testing for specific entry subjects (Maths, English, Science, Latin for traditional schools). Ask about books read, opinions on topics, a problem or puzzle they found interesting. Begin asking about boarding/school life ambitions. Ethical dilemmas can be introduced simply. Focus: intellectual engagement, reasoning, reading, articulacy.

- Age 15–16 (16+ / Sixth Form entry): More rigorous academic questioning. Expect candidates to discuss current affairs, ethical questions, a book or idea that challenged them, extended project or independent study. Begin asking about university ambitions. For selective grammar and independent sixth forms, probe subject passion and independent thinking. Focus: intellectual independence, subject depth, maturity of thought.

- Age 17–18 (Oxbridge / Russell Group / Ivy League university): The most demanding tier. Questions must probe genuine intellectual curiosity, subject mastery, the capacity to think under pressure, and the ability to engage with ideas outside the curriculum. At Oxbridge, expect tutorial-style probing — give an idea, push back, follow the candidate's reasoning. For Ivy League, expect reflection on identity, community contribution, leadership, and intellectual passion alongside academic rigour. Focus: independent thought, subject love, resilience under intellectual challenge, original ideas.

QUESTION DESIGN RULES FOR ACADEMIC TRACK:

Categories to use and how:

- Opening: Warm, age-appropriate introductory questions. "Tell me about yourself" adjusted for age. Never corporate.

- Academic Background: Their school record, favourite subjects, recent academic achievement, a piece of work they're proud of.

- Subject Motivation: WHY they want to study this subject (at university level) or why they love a particular subject (at school level). Must feel genuine — probe for the actual spark, not the rehearsed answer.

- Subject Knowledge: Only use for 13+ candidates and university applicants. Test actual knowledge in the target subject area. Reference specific topics relevant to the course or school entry exam focus.

- Critical Thinking: Present a problem, puzzle, or scenario appropriate to the age and ask them to reason through it aloud. At 7–11, keep it fun and concrete. At 16+, use abstract or philosophical framing.

- Personal Qualities: Character questions — perseverance, handling failure, collaboration, self-awareness. Age-appropriate framing throughout. At 7–9, "What do you do when something is difficult?" At 17–18, "Describe a moment you fundamentally changed your mind about something."

- Extra-Curricular: Clubs, sports, arts, community involvement, independent projects, hobbies. At younger ages, this is the richest window into personality. At university level, look for initiative and leadership within activities.

- Institution Fit: Why THIS school or university specifically — but never let it sound like a sales question. Probe for genuine knowledge of the institution: a teacher whose work they admire, a course structure that excites them, a club they'd join. Do not accept generic answers.

- Ethical Reasoning: Use for 13+ only. Moral dilemmas, fairness questions, current ethical debates (AI, environment, inequality, animal rights, political philosophy). Age-appropriate depth.

- Current Affairs: Use for 16+ only. A recent news story they found interesting, a debate in their field, a global issue they've thought about. Do NOT use for younger candidates.

- Challenge & Resilience: A time they failed, struggled academically, or found something genuinely hard. How did they respond? What did they learn? At younger ages: "Tell me about something that was tricky to learn." At older ages: more reflective, self-aware responses expected.

- Future Aspirations: What do they want to do, be, or understand? At 7–11, this should be light and imaginative. At 17–18, probe for genuine reflection — not just "I want to be a doctor" but what draws them to it and what they've done to explore it.

- Closing: Warm, open, age-appropriate final question. "Is there anything you'd like to tell us?" or "Is there anything you'd like to ask us?" Never abrupt.

CRITICAL RULES — DO NOT VIOLATE:

- Never use corporate or workplace language: no "stakeholder", "commercial awareness", "KPIs", "bandwidth", "leverage", "circle back". This is an academic setting.

- Never use adult professional framing for younger candidates. A 9-year-old should not be asked about "leadership style".

- Questions must feel like they come from a real admissions tutor, housemaster, or interviewer — not an AI, not a consultant.

- The first 10 questions MUST include at minimum: 2 × Subject Motivation, 2 × Critical Thinking or Subject Knowledge (age-appropriate), 2 × Personal Qualities, 1 × Academic Background, 1 × Institution Fit, 1 × Extra-Curricular. Remaining 1 = Opening or Ethical Reasoning.

- Example answers (foundation, strong, standout) must sound like the candidate speaking — a real 13-year-old, a real 17-year-old, a real Oxford applicant. Not a professional. Not a consultant. Adjust vocabulary, sentence length, and self-awareness to the developmental stage.

- "what_good_answers_should_cover" must reference the specific intellectual or personal qualities the interviewer is assessing — not generic interview skills.
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
