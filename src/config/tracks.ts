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
    blurb: "Professional job interviews across all sectors and seniority levels.",
    description:
      "Competency-based, behavioural and executive interview prep — from first professional role to C-suite. Questions calibrated to your seniority, sector, and the specific employer.",
  },
  {
    value: "graduate",
    label: "iPrpr: Graduate",
    shortLabel: "Graduate",
    blurb: "Graduate schemes, entry-level roles, and internship conversion.",
    description:
      "Prep built around limited experience — strengths-based, behavioural, and commercial awareness questions that work with what graduates actually have: degrees, societies, placements, and early work.",
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
    blurb: "Broadcast, podcast, press, and public-facing appearances.",
    description:
      "Not a job interview — media training for experts, founders, executives, and spokespeople. Message control, hostile challenge handling, soundbites, and performance under real scrutiny.",
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

// Track-specific guidance injected into the generation prompt.
// Keep in sync with supabase/functions/_shared/tracks.ts.
export const TRACK_PROMPT_GUIDANCE: Record<InterviewTrack, string> = {
  professional: `
PROFESSIONAL INTERVIEW TRACK

This track covers job interviews across all professional sectors and seniority levels — from first professional role through to C-suite and board-level appointments. It includes competency-based, behavioural, technical, case study, values-based, and executive-format interviews across the full range of UK and international employers: FTSE 100 and 250, private equity-backed businesses, professional services (Big Four, Magic Circle, MBB consultancies), financial services, technology, healthcare, media, public sector, and SMEs.

SENIORITY CALIBRATION — READ BEFORE GENERATING:

- Junior / Graduate-hire professionals (0–3 years): Questions focus on competency evidence from limited work experience, academic achievements, internships, and early-career projects. Expect shallow proof points — coach candidates to use the fullest specific examples they have. Commercial awareness tested at concept level.

- Mid-level (3–8 years): Richer behavioural evidence expected. Questions probe owned outcomes, stakeholder management, cross-functional work, and early leadership. Commercial awareness tested at application level — expect P&L awareness, market understanding, client impact.

- Senior / Lead (8–15 years): Strategic thinking, team leadership, change management, and commercial ownership. Questions explore judgment calls, difficult decisions, cultural impact, and building capability in others. Expect evidence of leading through ambiguity.

- Director / Executive (15+ years): Board-level questions. Governance, strategic positioning, external stakeholder credibility, P&L ownership, organisational transformation, and legacy. Questions probe philosophy and worldview, not just examples.

CATEGORY USAGE GUIDE:

- Opening: Crisp "tell me about yourself" and role overview. At senior levels, the walk-through should demonstrate strategic narrative, not just chronology.

- CV/Background: Deep dives into specific roles, transitions, gaps, or achievements on the CV. Never generic — must reference something specific from the candidate's actual profile.

- Role-Fit: Why this role, at this company, at this stage of their career. What specifically about the JD or the organisation matches their skills and ambitions. Probe for genuine knowledge.

- Behavioural: STAR-structured evidence questions ("Tell me about a time when…"). The most common format across all levels. Draw on the richest examples in the CV. Escalate complexity with seniority.

- Strengths: Concrete, evidenced strengths — not self-assessments. "What are you genuinely better at than most people?" Probe for specificity.

- Weaknesses: Real developmental areas, handled with maturity. Not "I work too hard." A genuine gap acknowledged and actively worked on.

- Leadership: Evidence of leading people, projects, or culture. At junior levels, informal leadership counts. At senior levels, test for philosophy, impact at scale, and difficult leadership moments.

- Stakeholder: Managing up, across, and out — difficult relationships, competing interests, influencing without authority, board and client management.

- Problem-Solving: Analytical and structured thinking under ambiguity. At junior levels, keep concrete. At senior levels, introduce complexity — trade-offs, incomplete information, organisational politics.

- Commercial Awareness: Market knowledge, financial literacy, competitive landscape, business model understanding. Must reference the actual sector and company, not generic commentary.

- Company Motivation: Why this company specifically — not the sector. Must test for real knowledge: a product, a person, a strategy, a cultural signal, a recent news story.

- Technical: Role-specific technical or domain knowledge. Use only where the JD or role clearly requires it. Do not fabricate — only include if the CV or job spec signals technical competency.

- Pressure: Stress-testing character. Difficult situations, ethical dilemmas, tight deadlines, public failure, uncomfortable feedback received. What did they actually do?

- Closing: Candidate questions to the interviewer, wrap-up, final statement of intent.

CRITICAL RULES:

- Every question in the first 10 must reference something specific and named from the CV, job spec, or company. No generic questions in the first 10.

- First 10 must include AT LEAST: 2 × CV/Background, 2 × Behavioural, 2 × Role-Fit, 1 × Pressure, 1 × Company Motivation. Remaining 2 = most revealing given this specific candidate.

- Example answers must reflect the seniority level — a Director's "strong" answer looks very different from a Mid-level's. Adjust vocabulary, ownership, and strategic depth accordingly.

- Commercial Awareness and Company Motivation questions must reference the actual company and sector from the job spec. Never use generic placeholders.

- Do not use corporate noise in questions or answers (see global rules).
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
GRADUATE INTERVIEW TRACK

This track covers entry-level recruitment for graduates and students targeting structured schemes, early-career programmes, and first professional roles. It includes:

- Graduate schemes at major employers (Deloitte, McKinsey, Goldman Sachs, NHS Graduate Management Training Scheme, Civil Service Fast Stream, BBC, Unilever, Marks & Spencer, Amazon, Teach First, and equivalents)

- Internship conversion interviews

- Strengths-based recruitment processes (increasingly common at top employers since 2015)

- Competency-based and mixed-format processes

- Assessment centre debrief interviews

- First professional role (0–2 years post-graduation) where the candidate has limited evidence

CRITICAL CONTEXT: Most graduate candidates have limited professional evidence. Questions must work with what they have: degrees, dissertations, part-time jobs, internships, societies, volunteering, sports captaincy, university projects, and academic achievement. Do not demand senior-level proof points.

SENIORITY CALIBRATION:

- Penultimate year / final year student: Evidence comes almost entirely from university and part-time or summer work. Probe potential, learning agility, and intellectual curiosity over track record. Strengths-based questions ("When do you feel most energised?") are as valuable as STAR here.

- Recent graduate (0–1 year post-graduation): May have one or two professional experiences. Questions can begin to probe early workplace moments while still drawing on university evidence.

- Early professional (1–2 years): Has real professional evidence. Questions should shift toward role performance, workplace relationships, and early commercial awareness — while still being fair to limited experience.

CATEGORY USAGE GUIDE:

- Opening: Light, warm introduction. "Walk me through your background" — focused on the journey from study to this application, not a full career narrative.

- Degree & Academic Record: Their degree, subject, grade, dissertation, modules chosen, academic achievements, prizes. At top-scheme level, this matters — probe for subject passion and academic rigour.

- Work Experience: Internships, part-time work, placements, voluntary roles. Even a retail job is evidence of reliability, customer focus, and handling pressure. Don't dismiss non-graduate work.

- Scheme Motivation: Why this specific scheme, at this specific employer. Test for real knowledge: what the scheme offers, how the rotation structure works, who the employer is, what recent news they know. Generic "I've always wanted to work in finance" is insufficient.

- Commercial Awareness: Understanding of the employer's business, market, competitors, and current challenges. For a bank: interest rates, deal flow, regulatory environment. For an FMCG firm: market share, innovation, distribution. Must reference the actual employer and sector.

- Behavioural: STAR-format evidence questions. Draw on the richest examples from their experience — academic projects, group work, society leadership, competitive sport, internships. "Tell me about a time when you had to work with someone very different from you."

- Strengths: Strengths-based questions increasingly used by top employers. "What do you find genuinely easy that others find hard?" "When do you feel most in your element?" These test authentic self-knowledge over rehearsed answers.

- Weaknesses: A developmental area the candidate genuinely knows about themselves, with evidence of working on it. Should feel honest, not like a trap.

- Leadership Potential: Evidence of leading peers — society president, team captain, project lead, group exercise coordinator. At this stage, informal leadership counts as much as formal.

- Teamwork: Collaborative moments — academic group projects, team sports, volunteering. "Tell me about a time the team disagreed — what did you do?"

- Problem-Solving: Analytical thinking under pressure. Can include case-style light probing: "Talk me through how you'd approach a situation where…" Keep accessible — no full case study maths.

- Values & Culture Fit: Does this candidate genuinely share the employer's values? Probe for authentic alignment, not coached answers. Use the employer's published values.

- Resilience: Handling setbacks, failure, disappointment. Academic failure, a rejected application, a poor exam result, a team that fell apart. How did they respond?

- Future Ambition: Where do they want to be in 3–5 years? Within this employer? What does career success mean to them? Test for realistic ambition and alignment with what the scheme offers.

- Closing: Candidate questions, final pitch. This is a graduate's chance to show preparation and genuine interest.

FIRST 10 QUESTIONS — GRADUATE TRACK MUST include at least:

2 × Behavioural, 2 × Scheme Motivation, 1 × Commercial Awareness, 1 × Degree & Academic Record, 1 × Strengths, 1 × Leadership Potential or Teamwork, 1 × Resilience. Remaining 1 = most revealing given this specific candidate.

CRITICAL RULES:

- Never demand evidence a graduate cannot reasonably have. Adapt the question so university or life evidence is explicitly valid.

- Strengths-based questions should feel open and curious — not like traps. They should invite authentic reflection.

- Commercial Awareness questions MUST reference the specific employer's sector, recent news, and business model. Never generic.

- Example answers must sound like a real graduate — not a seasoned professional. Use university examples naturally. Calibrate vocabulary and confidence to the developmental stage.

- Do not use corporate jargon in graduate-facing questions. "Leverage synergies" is never appropriate here.
`,

  media: `
MEDIA INTERVIEW TRACK

This track covers preparation for non-hiring media appearances — broadcast, podcast, press, and public-facing interviews where the person being interviewed is an expert, spokesperson, founder, author, executive, or public figure. It includes:

- Live broadcast interviews (BBC News, Sky News, Channel 4 News, ITV, radio)

- Long-form podcast conversations (Desert Island Discs, Diary of a CEO, How I Built This, specialist industry podcasts)

- Press and print interviews (broadsheets, trade publications, magazine profiles)

- Panel discussions and public debates

- Conference keynote Q&A sessions

- Spokesperson and crisis communications situations

- Book launch, product launch, or campaign PR interviews

- Social media video interviews and influencer conversations

CRITICAL CONTEXT: This is NOT a job interview. The "interviewer" may be adversarial, curious, uninformed, or trying to produce entertainment rather than illuminate truth. The candidate's goal is message control, authenticity under pressure, and leaving the audience with a specific feeling, understanding, or call to action. Coaching must reflect this fundamentally different dynamic.

APPEARANCE TYPE CALIBRATION:

- First-time media appearance: Focus on the basics — bridging, staying on message, not over-explaining, managing nerves, not filling silence. Keep questions accessible and confidence-building.

- Occasional media contributor: Comfortable with the format but prone to losing message discipline under pressure or interesting tangents. Focus on control, brevity, and landing the key point.

- Regular contributor / PR professional: Polished delivery but may be over-coached — answers can sound hollow. Focus on authenticity, spontaneity within structure, and genuinely connecting with the audience.

- Experienced public figure / executive: High stakes, high scrutiny. Hostile questions, difficult territory, and reputation management. Focus on crisis handling, nuance, and maintaining authority under pressure.

CATEGORY USAGE GUIDE:

- Opening: The "who are you" moment. In broadcast, you often have 10 seconds to establish credibility and likability. Practise the self-introduction for the specific format (podcast = warmer, longer; broadcast news = crisp, authoritative).

- Core Message: The one thing you want the audience to remember. Every answer should route back to this. Practise stating it in under 15 words. Then practise building to it from any starting point.

- Evidence & Examples: The stories, data points, and case studies that prove the core message. Vivid, specific, concrete. "When I was building X, we found that Y happened — and it changed how I think about Z."

- Hostile Challenge: The interviewer pushes back, contradicts, or plays devil's advocate. "But critics would say…", "Isn't it true that…", "Some people think you're just…" Practise staying calm, not over-defending, and acknowledging valid points without conceding the argument.

- Nuance & Complexity: "But what about…", "You're oversimplifying…", "There are two sides…" Handling complexity without losing the audience or your message. Acknowledge, absorb, return.

- Personal Story: The human moment — why does this person care? What's their origin story? A moment of failure, discovery, or transformation that explains who they are. In podcast format, this is often the richest territory.

- Difficult Territory: The question they're dreading. Past controversy, a failed project, a public mistake, an uncomfortable truth about their field. Practise meeting it with directness and equanimity rather than deflection.

- Bridging & Pivoting: "That's an important question, and it connects to something I think matters more…" The technique of acknowledging a question and moving to preferred territory. Must feel natural, not evasive.

- Soundbite & Hook: The quotable line. The thing a journalist will pull out, the clip that gets shared. Practise distilling the key idea into one vivid, memorable sentence. "The problem isn't X, it's that we've confused X with Y."

- Current Relevance: Why does this matter right now, to this specific audience? Connect the topic to what's in the news, what the audience is experiencing, what's changing. Anchors abstract expertise in the present moment.

- Call to Action: What do you want the audience to do, think, feel, or believe after this interview ends? For a book: buy it. For a campaign: join it. For expertise: trust it, apply it, share it. Ending with intention.

- Closing: The final moment — how to land gracefully, not trail off. Practise a closing statement that is warm, decisive, and memorable.

FIRST 10 QUESTIONS — MEDIA TRACK MUST include at least:

2 × Core Message, 2 × Hostile Challenge, 1 × Opening, 1 × Evidence & Examples, 1 × Difficult Territory, 1 × Bridging & Pivoting, 1 × Personal Story. Remaining 1 = most revealing given this specific candidate.

CRITICAL RULES:

- Questions must be phrased as an interviewer would actually ask them in the specific format — a BBC journalist sounds different from a podcast host. Use the "show/outlet" field to calibrate tone.

- Example answers (foundation, strong, standout) should feel like spoken media performance — not job interview answers. Rhythm, breath, and delivery matter. Foundation = functional; Strong = memorable; Standout = the clip that gets shared.

- "what_good_answers_should_cover" should describe the communication techniques being tested, not just the content — e.g. "Bridges to core message within 2 sentences • Acknowledges the challenge without conceding • Uses a single concrete example • Ends with a decisive statement."

- "why_this_question_matters" should explain what the audience or interviewer is really probing — entertainment, accountability, information, emotion.

- Do NOT use job-interview framing anywhere. There is no "role-fit." There is no "competency." This is public performance under real scrutiny.

- "answer_direction.length" should reference spoken delivery time — "30–45 seconds", "under a minute", not word counts.
`,
};
