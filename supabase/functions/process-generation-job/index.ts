// Worker function: performs the actual chunked AI generation for an interview pack.
// Invoked fire-and-forget by `generate-interview-pack` after it has inserted a
// `generation_jobs` row. Authenticates the caller via a shared service-role
// secret (the SUPABASE_SERVICE_ROLE_KEY in the Authorization header) — this
// function is NOT meant to be called by end users.
//
// Responsibilities:
//   - Mark job processing
//   - Generate questions in chunks, persisting after each chunk and updating
//     stage / progress on `generation_jobs`
//   - Verify the final question count matches what was requested before
//     marking the prep_session as 'ready'
//   - On any failure, mark job + session 'failed' and preserve partial rows
//     for diagnosis.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ukifyJson } from "../_shared/ukEnglish.ts";
import { TRACK_PROMPT_GUIDANCE, normaliseTrack } from "../_shared/tracks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-pro";
const PROMPT_VERSION = "v8-2026-04-27-uk-english-strict";

const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    candidate_summary: { type: "string", description: "2-3 sentence British-English summary of the candidate." },
    role_summary: { type: "string", description: "2-3 sentence British-English summary of the role and what the interviewer cares about." },
    top_themes: { type: "array", items: { type: "string" } },
    red_flag_areas: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          position: { type: "integer" },
          category: {
            type: "string",
            enum: [
              "Opening", "CV/Background", "Role-Fit", "Behavioural", "Strengths",
              "Weaknesses", "Leadership", "Stakeholder", "Problem-Solving",
              "Company Motivation", "Commercial Awareness", "Technical", "Pressure", "Closing",
            ],
          },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          question: { type: "string" },
          why_this_question_matters: { type: "string" },
          what_good_answers_should_cover: { type: "string" },
          optional_follow_up: { type: "string" },
          answer_framework: { type: "string" },
          answer_direction: {
            type: "object",
            properties: {
              structure: { type: "string" },
              length: { type: "string" },
              avoid: { type: "array", items: { type: "string" } },
            },
            required: ["structure", "length", "avoid"],
            additionalProperties: false,
          },
          example_answers: {
            type: "object",
            properties: {
              foundation: { type: "string" },
              strong: { type: "string" },
              standout: { type: "string" },
            },
            required: ["foundation", "strong", "standout"],
            additionalProperties: false,
          },
          coach_insight: {
            type: "object",
            properties: {
              really_testing: { type: "string" },
              common_mistake: { type: "string" },
              how_to_approach: { type: "string" },
            },
            required: ["really_testing", "common_mistake", "how_to_approach"],
            additionalProperties: false,
          },
        },
        required: [
          "position", "category", "difficulty", "question",
          "why_this_question_matters", "what_good_answers_should_cover",
          "answer_direction", "example_answers",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["candidate_summary", "role_summary", "top_themes", "red_flag_areas", "questions"],
  additionalProperties: false,
} as const;

// Academic-track variant: same shape as QUESTION_SCHEMA, with an
// academic-specific `category` enum on each question.
const ACADEMIC_QUESTION_SCHEMA = {
  type: "object",
  properties: {
    candidate_summary: { type: "string", description: "2-3 sentence British-English summary of the candidate." },
    role_summary: { type: "string", description: "2-3 sentence British-English summary of the role and what the interviewer cares about." },
    top_themes: { type: "array", items: { type: "string" } },
    red_flag_areas: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          position: { type: "integer" },
          category: {
            type: "string",
            enum: [
              "Opening",
              "Academic Background",
              "Subject Motivation",
              "Subject Knowledge",
              "Critical Thinking",
              "Personal Qualities",
              "Extra-Curricular",
              "Institution Fit",
              "Ethical Reasoning",
              "Current Affairs",
              "Challenge & Resilience",
              "Future Aspirations",
              "Closing",
            ],
          },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          question: { type: "string" },
          why_this_question_matters: { type: "string" },
          what_good_answers_should_cover: { type: "string" },
          optional_follow_up: { type: "string" },
          answer_framework: { type: "string" },
          answer_direction: {
            type: "object",
            properties: {
              structure: { type: "string" },
              length: { type: "string" },
              avoid: { type: "array", items: { type: "string" } },
            },
            required: ["structure", "length", "avoid"],
            additionalProperties: false,
          },
          example_answers: {
            type: "object",
            properties: {
              foundation: { type: "string" },
              strong: { type: "string" },
              standout: { type: "string" },
            },
            required: ["foundation", "strong", "standout"],
            additionalProperties: false,
          },
          coach_insight: {
            type: "object",
            properties: {
              really_testing: { type: "string" },
              common_mistake: { type: "string" },
              how_to_approach: { type: "string" },
            },
            required: ["really_testing", "common_mistake", "how_to_approach"],
            additionalProperties: false,
          },
        },
        required: [
          "position", "category", "difficulty", "question",
          "why_this_question_matters", "what_good_answers_should_cover",
          "answer_direction", "example_answers",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["candidate_summary", "role_summary", "top_themes", "red_flag_areas", "questions"],
  additionalProperties: false,
} as const;

// Graduate-track variant: same shape as QUESTION_SCHEMA, with a
// graduate-specific `category` enum on each question.
const GRADUATE_QUESTION_SCHEMA = {
  type: "object",
  properties: {
    candidate_summary: { type: "string", description: "2-3 sentence British-English summary of the candidate." },
    role_summary: { type: "string", description: "2-3 sentence British-English summary of the role and what the interviewer cares about." },
    top_themes: { type: "array", items: { type: "string" } },
    red_flag_areas: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          position: { type: "integer" },
          category: {
            type: "string",
            enum: [
              "Opening",
              "Degree & Academic Record",
              "Work Experience",
              "Scheme Motivation",
              "Commercial Awareness",
              "Behavioural",
              "Strengths",
              "Weaknesses",
              "Leadership Potential",
              "Teamwork",
              "Problem-Solving",
              "Values & Culture Fit",
              "Resilience",
              "Future Ambition",
              "Closing",
            ],
          },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          question: { type: "string" },
          why_this_question_matters: { type: "string" },
          what_good_answers_should_cover: { type: "string" },
          optional_follow_up: { type: "string" },
          answer_framework: { type: "string" },
          answer_direction: {
            type: "object",
            properties: {
              structure: { type: "string" },
              length: { type: "string" },
              avoid: { type: "array", items: { type: "string" } },
            },
            required: ["structure", "length", "avoid"],
            additionalProperties: false,
          },
          example_answers: {
            type: "object",
            properties: {
              foundation: { type: "string" },
              strong: { type: "string" },
              standout: { type: "string" },
            },
            required: ["foundation", "strong", "standout"],
            additionalProperties: false,
          },
          coach_insight: {
            type: "object",
            properties: {
              really_testing: { type: "string" },
              common_mistake: { type: "string" },
              how_to_approach: { type: "string" },
            },
            required: ["really_testing", "common_mistake", "how_to_approach"],
            additionalProperties: false,
          },
        },
        required: [
          "position", "category", "difficulty", "question",
          "why_this_question_matters", "what_good_answers_should_cover",
          "answer_direction", "example_answers",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["candidate_summary", "role_summary", "top_themes", "red_flag_areas", "questions"],
  additionalProperties: false,
} as const;

// Media-track variant: same shape as QUESTION_SCHEMA, with a
// media-specific `category` enum on each question.
const MEDIA_QUESTION_SCHEMA = {
  type: "object",
  properties: {
    candidate_summary: { type: "string", description: "2-3 sentence British-English summary of the candidate." },
    role_summary: { type: "string", description: "2-3 sentence British-English summary of the role and what the interviewer cares about." },
    top_themes: { type: "array", items: { type: "string" } },
    red_flag_areas: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          position: { type: "integer" },
          category: {
            type: "string",
            enum: [
              "Opening",
              "Core Message",
              "Evidence & Examples",
              "Hostile Challenge",
              "Nuance & Complexity",
              "Personal Story",
              "Difficult Territory",
              "Bridging & Pivoting",
              "Soundbite & Hook",
              "Current Relevance",
              "Call to Action",
              "Closing",
            ],
          },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          question: { type: "string" },
          why_this_question_matters: { type: "string" },
          what_good_answers_should_cover: { type: "string" },
          optional_follow_up: { type: "string" },
          answer_framework: { type: "string" },
          answer_direction: {
            type: "object",
            properties: {
              structure: { type: "string" },
              length: { type: "string" },
              avoid: { type: "array", items: { type: "string" } },
            },
            required: ["structure", "length", "avoid"],
            additionalProperties: false,
          },
          example_answers: {
            type: "object",
            properties: {
              foundation: { type: "string" },
              strong: { type: "string" },
              standout: { type: "string" },
            },
            required: ["foundation", "strong", "standout"],
            additionalProperties: false,
          },
          coach_insight: {
            type: "object",
            properties: {
              really_testing: { type: "string" },
              common_mistake: { type: "string" },
              how_to_approach: { type: "string" },
            },
            required: ["really_testing", "common_mistake", "how_to_approach"],
            additionalProperties: false,
          },
        },
        required: [
          "position", "category", "difficulty", "question",
          "why_this_question_matters", "what_good_answers_should_cover",
          "answer_direction", "example_answers",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["candidate_summary", "role_summary", "top_themes", "red_flag_areas", "questions"],
  additionalProperties: false,
} as const;

function clip(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) : s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Auth: require the service role key in the Authorization header. This
  // function is invoked service-to-service from `generate-interview-pack`.
  const authHeader = req.headers.get("Authorization") ?? "";
  const providedToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!providedToken || providedToken !== SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let jobId: string | null = null;
  let sessionId: string | null = null;
  let userId: string | null = null;

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    jobId = body.job_id ?? null;
    if (!jobId) throw new Error("job_id is required");

    console.log(`[worker] starting job ${jobId}`);

    const { data: job, error: jobErr } = await admin
      .from("generation_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr) throw jobErr;
    if (!job) throw new Error(`generation_jobs row ${jobId} not found`);

    sessionId = job.prep_session_id;
    userId = job.user_id;

    const { data: session, error: sErr } = await admin
      .from("prep_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!session) throw new Error(`prep_session ${sessionId} not found`);

    // Hard product constraint: packs are exactly 50 questions. Never generate more.
    const numQuestions = 50;

    // ===== TESTING_MODE: fast beta generation =====
    // In testing mode we generate a lean preview chunk first (no answer tiers,
    // no coach insights, no answer_direction) using a faster model, so the
    // first 10 questions are visible in seconds. Remaining questions are
    // generated in the background with the same lean schema; enrichment is
    // deferred to on-demand later.
    let testingMode = false;
    try {
      const { data: tm } = await admin.rpc("testing_mode_enabled");
      testingMode = tm === true;
    } catch (_) { /* default off */ }

    const FAST_MODEL = "google/gemini-2.5-flash";
    const previewModel = testingMode ? FAST_MODEL : MODEL;
    const restModel = testingMode ? FAST_MODEL : MODEL;
    const leanPreview = testingMode;
    const leanRest = testingMode;
    if (testingMode) {
      console.log(`[worker] job ${jobId} TESTING_MODE on — lean preview + flash model`);
    }

    const updateJob = async (patch: Record<string, unknown>) => {
      await admin.from("generation_jobs").update(patch).eq("id", jobId);
    };

    await updateJob({
      status: "processing",
      stage: "Preparing",
      progress: 2,
      started_at: new Date().toISOString(),
    });
    console.log(`[worker] job ${jobId} marked processing`);

    // Fixed chunking for the 50-question pack: 1–10 (fast preview), 11–25, 26–40, 41–50.
    const chunkRanges: Array<{ start: number; end: number; label: string }> = [
      { start: 1,  end: 10, label: "Preparing your first questions" },
      { start: 11, end: 25, label: "Building the rest in the background (11–25)" },
      { start: 26, end: 40, label: "Building the rest in the background (26–40)" },
      { start: 41, end: 50, label: "Building the rest in the background (41–50)" },
    ];

    const systemPrompt = `You are a senior UK-based interview coach for iPrpr by The Speech Coach. You write in British English (en-GB).
Your job: generate sharp, realistic, interview-grade questions tailored to a specific candidate and role.

LANGUAGE — UK ENGLISH ONLY (non-negotiable):
- Use British spelling everywhere: organisation, behaviour, behavioural, favour, favourite, colour, recognise, realise, optimise, prioritise, summarise, analyse, programme (not program, except for software code), centre, defence, licence (noun) / license (verb), practice (noun) / practise (verb), enrolment, fulfil, modelling, travelling, cancelled, labelled, judgement, acknowledgement.
- Reject US spellings: NEVER write organize, behavior, favorite, color, recognize, realize, optimize, analyze, prioritize, gotten, gray, defense, license (as noun), practiced (as verb), enrollment, fulfillment, traveled, labeled, modeling, judgment.
- Avoid Americanisms in phrasing and idiom: no "reach out", no "circle back", no "I'd love to", no "awesome", no "leverage" as a verb where "use" works, no "gotten". Prefer "have" over "have got".
- Use British punctuation conventions: single quotes for inner quotes where natural; full stop inside quotation marks only when the quote is a complete sentence.
- Tone: direct, professional, concise, confident. No American sales language, no hype, no exclamation marks unless quoting someone.

CLARITY & ACCESSIBILITY (non-negotiable, applies to EVERY string you produce):
The aim is precise, professional language that is easy to understand on first read. Do NOT dumb down the ideas. Simplify the EXPRESSION, not the substance. Keep nuance, strategic depth and complexity of thought intact — only fix wording, structure and delivery.
- Plain, direct sentences. One idea per sentence. Aim for ~15–18 words per sentence; never stack clauses.
- No academic, institutional or report-style register. Everything must sound like a strong candidate or coach SPEAKING out loud, not writing a paper.
- No connector throat-clearing: avoid "therefore", "moreover", "furthermore", "in addition", "thus" unless truly needed.
- Prefer short Anglo-Saxon verbs: use "show" not "demonstrate"; "use" not "utilise"; "help" not "facilitate"; "work with" not "collaborate with" (unless precision requires it); "explain" not "articulate"; "build" not "establish"; "run" not "execute" (where natural).
- Banned corporate noise (rewrite into real actions and outcomes): "leverage", "synergies", "stakeholder alignment", "value-add", "strategic initiatives", "circle back", "deep dive", "move the needle", "drive impact", "bandwidth", "robust", "holistic", "best-in-class", "ecosystem", "go-to-market motion" (as filler).
- Replace abstractions with the specific behaviour or outcome. E.g. NOT "Demonstrate your capacity to effectively leverage cross-functional synergies" — instead "Explain how you worked with other teams to get results."
- Accessibility test before emitting any string: (a) Can it be understood in one read? (b) Could a 16-year-old follow the sentence structure (even if not the concept)? (c) Could a real professional say it aloud in a live interview without sounding stilted? If any answer is no, rewrite.

Hard rules:
- No generic filler. Every question must reference something specific from the CV, the role, or the company context.
- Questions must read as if a real, experienced interviewer wrote them — and could SAY them out loud.
- Calibrate difficulty mix to the seniority and chosen difficulty level.
- Distribute categories across the interview arc (Opening → Closing).
- "why_this_question_matters" — 1–2 short sentences. State plainly what the interviewer is actually testing. No jargon.
- "what_good_answers_should_cover" — 3–5 concrete behaviours or ideas, written as short bullet-style points separated by " • " (e.g. "Names the specific decision • Shows the trade-off considered • Quantifies the outcome"). Each point is one clear idea, no stacked clauses.
- "optional_follow_up" — one sharp probing follow-up the interviewer might ask aloud; empty string if none.
- "answer_direction" — short, sharp, practical coaching for delivery, not content. "structure" = one sentence. "length" = a concrete time/size cue. "avoid" = 2–4 specific traps phrased as quick warnings.
- "example_answers" — THREE tiers: foundation, strong, standout. SPOKEN answers, first person ("I"), natural rhythm. Reference specifics from the CV/role. No corporate noise. Read each one out loud in your head — if it sounds like a memo, rewrite.
  • foundation = clear, simple, direct. 40–80 words.
  • strong = structured, confident, commercially aware. 60–110 words.
  • standout = 20–30 seconds spoken (50–75 words, never more than 80).
- Avoid jargon unless the role genuinely demands it. If a domain term is needed, use it once and move on.
- Position numbers are 1-based and sequential.

CRITICAL — THE FIRST 10 QUESTIONS (positions 1–10):
These ten questions are the only thing many candidates will ever see. They MUST feel uncomfortably accurate. Every one of the first 10 must reference a specific, named detail from the CV, the job description, or the company.

The first 10 question distribution is specified per track in the TRACK GUIDANCE block above. Follow that distribution exactly. If no track-specific distribution is given, use the default: 2 × CV/Background, 2 × Behavioural, 2 × Role-Fit, 1 × Pressure, 1 × Company Motivation, Remaining 2 = most revealing given this candidate.

After position 10, distribute the remaining categories naturally across the interview arc.

COACH INSIGHTS (selective):
Choose EXACTLY 3–5 of the most pivotal questions in the entire pack and attach a "coach_insight" object to each. Strongly prefer questions inside positions 1–10. Every other question MUST omit "coach_insight" entirely. Coach insights follow the same clarity rules: spoken register, short sentences, real behaviour over abstractions.`;

    const trackGuidance = TRACK_PROMPT_GUIDANCE[normaliseTrack((session as any).interview_track)];

    const candidateRoleBlock = `${trackGuidance}

CANDIDATE PROFILE
- Name: ${session.full_name || "—"}
- Current role: ${session.candidate_current_role || "—"}
- Years experience: ${session.years_experience || "—"}
- Target role: ${session.target_role || "—"}
- Target industry: ${session.target_industry || "—"}
- Seniority: ${session.seniority_level || "—"}
- Country: ${session.country || "—"}
- Notes: ${session.candidate_notes || "—"}

CV TEXT
${clip(session.cv_text, 8000) || "Not provided"}

LINKEDIN SUMMARY (reference)
${clip(session.linkedin_text, 2000) || "Not provided"}

ROLE
- Job title: ${session.job_title || session.target_role || "—"}
- Company: ${session.company_name || "—"}
- Description / spec:
${clip(session.job_description, 8000) || "Not provided"}

ORGANISATION RESEARCH
${(() => {
  const r = (session as any).organisation_research;
  if (!r || typeof r !== "object") return "Not provided.";
  if (r.status === "failed") return "Automated research failed — rely only on the candidate profile and supplied job spec. Do not invent organisation facts.";
  const limited = r.status === "limited";
  const lines: string[] = [];
  if (r.organisation_name) lines.push(`- Organisation: ${r.organisation_name}${r.organisation_type ? ` (${r.organisation_type})` : ""}`);
  if (r.summary) lines.push(`- Summary: ${r.summary}`);
  if (Array.isArray(r.mission_values) && r.mission_values.length) lines.push(`- Values: ${r.mission_values.slice(0, 6).join("; ")}`);
  if (Array.isArray(r.recent_news) && r.recent_news.length) lines.push(`- Recent news: ${r.recent_news.slice(0, 4).join("; ")}`);
  if (Array.isArray(r.products_services_programmes) && r.products_services_programmes.length) lines.push(`- Products / programmes: ${r.products_services_programmes.slice(0, 6).join("; ")}`);
  if (Array.isArray(r.culture_signals) && r.culture_signals.length) lines.push(`- Culture signals: ${r.culture_signals.slice(0, 6).join("; ")}`);
  if (r.preferred_interview_style) lines.push(`- Preferred interview style: ${r.preferred_interview_style}`);
  if (Array.isArray(r.known_interview_methods) && r.known_interview_methods.length) lines.push(`- Known interview methods: ${r.known_interview_methods.slice(0, 6).join("; ")}`);
  if (Array.isArray(r.likely_assessment_criteria) && r.likely_assessment_criteria.length) lines.push(`- Likely assessment criteria: ${r.likely_assessment_criteria.slice(0, 6).join("; ")}`);
  if (Array.isArray(r.track_specific_notes) && r.track_specific_notes.length) lines.push(`- Track-specific notes: ${r.track_specific_notes.slice(0, 6).join("; ")}`);
  if (limited) lines.push("- NOTE: Web research was not available. Base questions on the supplied brief; do not invent organisation facts.");
  return lines.length ? lines.join("\n") : "Not provided.";
})()}

INTERVIEW PARAMETERS
- Interview type: ${session.interview_type}
- Difficulty: ${session.difficulty}
- Tone: ${session.output_tone}
- Style: ${session.interview_style}
- Focus mix (rough %): ${JSON.stringify(session.focus_mix)}
- Include follow-ups: ${session.include_followups}
- Include answer framework: ${session.include_answer_angles}`;

    // Lean question schema for fast beta generation: drop expensive fields
    // (answer_direction, example_answers, coach_insight) so the model can
    // return the first 10 questions in seconds. Enrichment is added on demand.
    const activeSchema =
      normaliseTrack((session as any).interview_track) === "academic"
        ? ACADEMIC_QUESTION_SCHEMA
        : normaliseTrack((session as any).interview_track) === "graduate"
        ? GRADUATE_QUESTION_SCHEMA
        : normaliseTrack((session as any).interview_track) === "media"
        ? MEDIA_QUESTION_SCHEMA
        : QUESTION_SCHEMA;

    const LEAN_QUESTION_PROPS = {
      position: { type: "integer" },
      category: (activeSchema.properties.questions as any).items.properties.category,
      difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
      question: { type: "string" },
      why_this_question_matters: { type: "string" },
      what_good_answers_should_cover: { type: "string" },
      optional_follow_up: { type: "string" },
    } as const;
    const LEAN_QUESTION_SCHEMA = {
      type: "array",
      description: "Tailored interview questions in interview order (lean schema).",
      items: {
        type: "object",
        properties: LEAN_QUESTION_PROPS,
        required: [
          "position", "category", "difficulty", "question",
          "why_this_question_matters", "what_good_answers_should_cover",
        ],
        additionalProperties: false,
      },
    } as const;

    const buildChunkSchema = (includeSummary: boolean, lean: boolean) => {
      const props: any = {
        questions: lean ? LEAN_QUESTION_SCHEMA : activeSchema.properties.questions,
      };
      const required: string[] = ["questions"];
      if (includeSummary) {
        props.candidate_summary = activeSchema.properties.candidate_summary;
        props.role_summary = activeSchema.properties.role_summary;
        props.top_themes = activeSchema.properties.top_themes;
        props.red_flag_areas = activeSchema.properties.red_flag_areas;
        required.push("candidate_summary", "role_summary", "top_themes", "red_flag_areas");
      }
      return { type: "object", properties: props, required, additionalProperties: false };
    };

    let summary: {
      candidate_summary: string | null;
      role_summary: string | null;
      top_themes: any[];
      red_flag_areas: any[];
    } = { candidate_summary: null, role_summary: null, top_themes: [], red_flag_areas: [] };

    let totalGenerated = 0;
    const totalChunks = chunkRanges.length;

    for (let ci = 0; ci < chunkRanges.length; ci++) {
      const range = chunkRanges[ci];
      const isFirst = ci === 0;
      const expectedCount = range.end - range.start + 1;

      console.log(`[worker] job ${jobId} chunk ${ci + 1}/${totalChunks} (${range.start}-${range.end})`);

      await updateJob({
        stage: range.label,
        progress: Math.max(2, Math.round((ci / totalChunks) * 90) + 2),
      });

      const useLeanForChunk = isFirst ? leanPreview : leanRest;
      const modelForChunk = isFirst ? previewModel : restModel;

      const leanNote = useLeanForChunk
        ? ` Use the LEAN schema only — do NOT include answer_direction, example_answers, or coach_insight. Keep "why_this_question_matters" and "what_good_answers_should_cover" tight (one sentence each).`
        : "";

      const chunkInstruction = isFirst
        ? `This is CHUNK 1 of ${totalChunks}. Generate ONLY positions ${range.start}–${range.end} of the full ${numQuestions}-question pack. These are the high-stakes opening questions — apply the FIRST 10 rules strictly. Also return the overall candidate_summary, role_summary, top_themes, and red_flag_areas for the whole pack.${leanNote}`
        : `This is CHUNK ${ci + 1} of ${totalChunks}. Generate ONLY positions ${range.start}–${range.end} of the full ${numQuestions}-question pack. Do NOT repeat earlier positions. Distribute categories naturally across the interview arc.${leanNote}`;

      const userPrompt = `${chunkInstruction}

${candidateRoleBlock}

REMINDER: Return EXACTLY ${expectedCount} questions, each with the position field set to its absolute position (between ${range.start} and ${range.end}). Use the produce_interview_pack tool. Do not write any prose outside the tool call.`;

      const aiResp = await fetch(AI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelForChunk,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "produce_interview_pack",
              description: "Return the structured interview pack chunk.",
              parameters: buildChunkSchema(isFirst, useLeanForChunk),
            },
          }],
          tool_choice: { type: "function", function: { name: "produce_interview_pack" } },
        }),
      });

      if (!aiResp.ok) {
        const t = await aiResp.text();
        let label = "AI gateway error";
        if (aiResp.status === 429) label = "We're being rate limited. Try again shortly.";
        if (aiResp.status === 402) label = "AI credits exhausted. Please contact support.";
        throw new Error(`${label} (status ${aiResp.status}): ${t.slice(0, 200)}`);
      }

      const aiJson = await aiResp.json();
      const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
      const argsRaw = toolCall?.function?.arguments;
      if (!argsRaw) throw new Error("AI returned no tool call for this chunk");

      let parsed: any;
      try {
        parsed = typeof argsRaw === "string" ? JSON.parse(argsRaw) : argsRaw;
      } catch {
        throw new Error("AI tool arguments were not valid JSON");
      }
      parsed = ukifyJson(parsed);

      if (isFirst) {
        summary = {
          candidate_summary: parsed.candidate_summary ?? null,
          role_summary: parsed.role_summary ?? null,
          top_themes: parsed.top_themes ?? [],
          red_flag_areas: parsed.red_flag_areas ?? [],
        };
        await admin.from("prep_sessions").update({
          candidate_summary: summary.candidate_summary,
          role_summary: summary.role_summary,
          top_themes: summary.top_themes,
          red_flags: summary.red_flag_areas,
        }).eq("id", sessionId);
      }

      const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
      if (!questions.length) throw new Error(`AI returned no questions for chunk ${ci + 1}`);

      const rows = questions.map((q: any, i: number) => ({
        session_id: sessionId,
        user_id: userId,
        position: Number.isInteger(q.position) ? q.position : range.start + i,
        category: q.category ?? "General",
        question: q.question ?? "",
        why_matters: q.why_this_question_matters ?? null,
        what_good_covers: q.what_good_answers_should_cover ?? null,
        follow_up: q.optional_follow_up || null,
        answer_framework: q.answer_framework || null,
        answer_direction: q.answer_direction ?? null,
        example_answers: q.example_answers ?? null,
        coach_insight: q.coach_insight ?? null,
        difficulty: q.difficulty ?? null,
      }));

      for (let i = 0; i < rows.length; i += 50) {
        const sub = rows.slice(i, i + 50);
        const { error } = await admin.from("interview_questions").insert(sub);
        if (error) console.error(`[worker] question insert error chunk ${ci + 1}:`, error);
      }

      totalGenerated += rows.length;

      // Re-count from the database — that's the source of truth the
      // frontend polls against. (`interview_questions.session_id` ≡
      // `generation_jobs.prep_session_id`; see migration comments.)
      const { count: livePersisted } = await admin
        .from("interview_questions")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId);

      const stageAfterSave = testingMode && isFirst
        ? "Your first questions are ready. We're building the rest in the background."
        : `${range.label} · saved`;
      await updateJob({
        stage: stageAfterSave,
        progress: Math.min(95, Math.round(((ci + 1) / totalChunks) * 90) + 2),
        questions_generated: livePersisted ?? totalGenerated,
      });

      // Fast first-value flip: as soon as the opening chunk lands, mark the
      // session `initial_ready` so the wizard / Results page can show the
      // first 10 questions immediately while the worker keeps going.
      if (isFirst) {
        await admin
          .from("prep_sessions")
          .update({ status: "initial_ready" })
          .eq("id", sessionId);
        console.log(`[worker] job ${jobId} marked prep_session ${sessionId} initial_ready (${livePersisted ?? totalGenerated} questions visible)`);
      }

      console.log(`[worker] job ${jobId} chunk ${ci + 1}/${totalChunks} saved (${rows.length} rows; total ${livePersisted ?? totalGenerated})`);
    }

    // ===== Verification gate =====
    // Source-of-truth count from the database, not the in-memory accumulator.
    const { count: persistedCount } = await admin
      .from("interview_questions")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    console.log(`[worker] job ${jobId} verification: persisted=${persistedCount} expected=${numQuestions}`);

    if ((persistedCount ?? 0) !== numQuestions) {
      // Persist whatever pack metadata we have but DO NOT mark the session ready.
      await admin.from("generated_interview_packs").insert({
        user_id: userId,
        session_id: sessionId,
        workspace_id: session.workspace_id ?? null,
        status: "incomplete",
        candidate_summary: summary.candidate_summary,
        role_summary: summary.role_summary,
        top_themes: summary.top_themes,
        red_flags: summary.red_flag_areas,
        total_questions: persistedCount ?? 0,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
      });
      const errMsg = `Generation incomplete: expected ${numQuestions} questions, got ${persistedCount ?? 0}.`;
      throw new Error(errMsg);
    }

    // Persist final pack record.
    const { data: pack, error: pErr } = await admin
      .from("generated_interview_packs")
      .insert({
        user_id: userId,
        session_id: sessionId,
        workspace_id: session.workspace_id ?? null,
        status: "ready",
        candidate_summary: summary.candidate_summary,
        role_summary: summary.role_summary,
        top_themes: summary.top_themes,
        red_flags: summary.red_flag_areas,
        total_questions: persistedCount,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
      })
      .select()
      .single();
    if (pErr) throw pErr;

    await admin.from("prep_sessions").update({ status: "ready" }).eq("id", sessionId);

    await updateJob({
      status: "completed",
      progress: 100,
      stage: "Completed",
      questions_generated: persistedCount ?? numQuestions,
      completed_at: new Date().toISOString(),
    });

    await admin.from("admin_logs").insert({
      event: "pack_generated",
      metadata: {
        user_id: userId,
        session_id: sessionId,
        job_id: jobId,
        pack_id: pack.id,
        count: persistedCount,
        model: MODEL,
        chunks: totalChunks,
      },
    });

    console.log(`[worker] job ${jobId} completed`);

    return new Response(
      JSON.stringify({ ok: true, job_id: jobId, total_questions: persistedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    const message = e?.message ?? String(e);
    console.error(`[worker] job ${jobId} failed:`, message);
    try {
      if (sessionId) {
        await admin.from("prep_sessions").update({ status: "failed" }).eq("id", sessionId);
      }
      if (jobId) {
        await admin.from("generation_jobs").update({
          status: "failed",
          error_message: message.slice(0, 500),
          failed_at: new Date().toISOString(),
        }).eq("id", jobId);
      }
      await admin.from("admin_logs").insert({
        event: "pack_generation_failed",
        metadata: { user_id: userId, session_id: sessionId, job_id: jobId, error: message },
      });
    } catch (_) {}
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
