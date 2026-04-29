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

    const numQuestions = Math.max(20, Math.min(120, session.num_questions ?? 100));

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

    // Plan chunks. In testing mode we use a smaller chunk size for the
    // background tail too, so progress updates flow more frequently.
    const PREVIEW_SIZE = Math.min(10, numQuestions);
    const CHUNK_SIZE = testingMode ? 20 : 30;
    const chunkRanges: Array<{ start: number; end: number; label: string }> = [];
    if (PREVIEW_SIZE > 0) {
      chunkRanges.push({
        start: 1,
        end: PREVIEW_SIZE,
        label: testingMode ? "Preparing your first questions" : `Writing the high-stakes opening (1–${PREVIEW_SIZE})`,
      });
    }
    let cursor = PREVIEW_SIZE + 1;
    while (cursor <= numQuestions) {
      const end = Math.min(numQuestions, cursor + CHUNK_SIZE - 1);
      chunkRanges.push({
        start: cursor,
        end,
        label: testingMode
          ? `Building the rest in the background (${cursor}–${end})`
          : `Writing questions ${cursor}–${end}`,
      });
      cursor = end + 1;
    }

    const systemPrompt = `You are a senior UK-based interview coach for The Speech Coach. You write in British English (en-GB).
Your job: generate sharp, realistic, interview-grade questions tailored to a specific candidate and role.

LANGUAGE — UK ENGLISH ONLY (non-negotiable):
- Use British spelling everywhere: organisation, behaviour, behavioural, favour, favourite, colour, recognise, realise, optimise, prioritise, summarise, analyse, programme (not program, except for software code), centre, defence, licence (noun) / license (verb), practice (noun) / practise (verb), enrolment, fulfil, modelling, travelling, cancelled, labelled, judgement, acknowledgement.
- Reject US spellings: NEVER write organize, behavior, favorite, color, recognize, realize, optimize, analyze, prioritize, gotten, gray, defense, license (as noun), practiced (as verb), enrollment, fulfillment, traveled, labeled, modeling, judgment.
- Avoid Americanisms in phrasing and idiom: no "reach out", no "circle back", no "I'd love to", no "awesome", no "leverage" as a verb where "use" works, no "gotten". Prefer "have" over "have got".
- Use British punctuation conventions: single quotes for inner quotes where natural; full stop inside quotation marks only when the quote is a complete sentence.
- Tone: direct, professional, concise, confident. No American sales language, no hype, no exclamation marks unless quoting someone.

Hard rules:
- No generic filler. Every question must reference something specific from the CV, the role, or the company context.
- Questions must read as if a real, experienced interviewer wrote them.
- Calibrate difficulty mix to the seniority and chosen difficulty level.
- Distribute categories across the interview arc (Opening → Closing).
- "why_this_question_matters" explains the interviewer's intent in one tight sentence.
- "what_good_answers_should_cover" lists the substance a strong answer should hit (2-4 concrete points).
- "optional_follow_up" is a sharp probing follow-up the interviewer might use; empty string if none.
- "answer_direction" is short, sharp, practical coaching for delivery — not content. Keep "structure" to one sentence, "length" to a concrete time/size cue, and "avoid" to 2-4 specific traps phrased as quick warnings.
- "example_answers" gives THREE tiers: foundation, strong, standout. SPOKEN answers, not written prose. First person ("I"). Reference specifics from the CV/role.
  • foundation = clear, simple, direct. 40–80 words.
  • strong = structured, confident, commercially aware. 60–110 words.
  • standout = 20–30 seconds spoken (50–75 words, never more than 80).
- Avoid jargon unless the role demands it.
- Position numbers are 1-based and sequential.

CRITICAL — THE FIRST 10 QUESTIONS (positions 1–10):
These ten questions are the only thing many candidates will ever see. They MUST feel uncomfortably accurate. Every one of the first 10 must reference a specific, named detail from the CV, the job description, or the company.

The first 10 must include AT LEAST: 2 × CV/Background, 2 × Behavioural, 2 × Role-Fit, 1 × Pressure, 1 × Company Motivation. Remaining 2 = next-most-revealing.

After position 10, distribute the remaining categories naturally across the interview arc.

COACH INSIGHTS (selective):
Choose EXACTLY 3–5 of the most pivotal questions in the entire pack and attach a "coach_insight" object to each. Strongly prefer questions inside positions 1–10. Every other question MUST omit "coach_insight" entirely.`;

    const candidateRoleBlock = `CANDIDATE PROFILE
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
    const LEAN_QUESTION_PROPS = {
      position: { type: "integer" },
      category: (QUESTION_SCHEMA.properties.questions as any).items.properties.category,
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
        questions: lean ? LEAN_QUESTION_SCHEMA : QUESTION_SCHEMA.properties.questions,
      };
      const required: string[] = ["questions"];
      if (includeSummary) {
        props.candidate_summary = QUESTION_SCHEMA.properties.candidate_summary;
        props.role_summary = QUESTION_SCHEMA.properties.role_summary;
        props.top_themes = QUESTION_SCHEMA.properties.top_themes;
        props.red_flag_areas = QUESTION_SCHEMA.properties.red_flag_areas;
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

      const chunkInstruction = isFirst
        ? `This is CHUNK 1 of ${totalChunks}. Generate ONLY positions ${range.start}–${range.end} of the full ${numQuestions}-question pack. These are the high-stakes opening questions — apply the FIRST 10 rules strictly. Also return the overall candidate_summary, role_summary, top_themes, and red_flag_areas for the whole pack.`
        : `This is CHUNK ${ci + 1} of ${totalChunks}. Generate ONLY positions ${range.start}–${range.end} of the full ${numQuestions}-question pack. Do NOT repeat earlier positions. Distribute categories naturally across the interview arc.`;

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
          model: MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "produce_interview_pack",
              description: "Return the structured interview pack chunk.",
              parameters: buildChunkSchema(isFirst),
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

      await updateJob({
        stage: `${range.label} · saved`,
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
