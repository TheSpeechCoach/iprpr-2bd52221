// Generate a tailored interview pack via Lovable AI Gateway.
// Auth required. Strict JSON via tool-calling. Persists pack + questions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ukifyJson } from "../_shared/ukEnglish.ts";
import { namesLooselyMatch, cvMentionsName, normaliseName } from "../_shared/candidateLock.ts";
import { PRO_LIMITS, getProUsage, buildLimitBlock } from "../_shared/proLimits.ts";
import { logRequest } from "../_shared/requestAudit.ts";
import { evaluateAccount } from "../_shared/abuseDetector.ts";

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
    top_themes: {
      type: "array",
      items: { type: "string" },
      description: "5-8 themes the interview will probe (specific, not generic).",
    },
    red_flag_areas: {
      type: "array",
      items: { type: "string" },
      description: "Concrete CV/role gaps or risks the interviewer will likely test.",
    },
    questions: {
      type: "array",
      description: "Tailored interview questions in interview order.",
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
            description: "Sharp, practical coaching for how to deliver the answer.",
            properties: {
              structure: {
                type: "string",
                description: "How a strong answer should be shaped (e.g. 'Situation → tension → action you owned → measurable result'). One tight sentence.",
              },
              length: {
                type: "string",
                description: "How concise. Use a target like '60–90 seconds' or '2–3 short paragraphs'. One short phrase.",
              },
              avoid: {
                type: "array",
                items: { type: "string" },
                description: "2-4 specific traps to avoid (e.g. 'Rambling preamble', 'Hiding behind \"we\"', 'Jargon without proof'). Each item ≤ 8 words.",
              },
            },
            required: ["structure", "length", "avoid"],
            additionalProperties: false,
          },
          example_answers: {
            type: "object",
            description: "Three tiers of model answers written as if spoken aloud in the interview room. UK English. Natural, controlled, no written prose.",
            properties: {
              foundation: {
                type: "string",
                description: "Foundation tier. Clear, simple, direct. Sounds like a calm candidate giving a solid baseline answer. Spoken, not written. 40–80 words.",
              },
              strong: {
                type: "string",
                description: "Strong tier. Structured, confident, commercially aware. Tight ownership ('I'), one concrete example or number. Spoken. 60–110 words.",
              },
              standout: {
                type: "string",
                description: "Standout tier. 20–30 seconds spoken — roughly 50–75 words, hard ceiling 80. Sharp, controlled, intentional. One pointed opening line, one crisp judgement or trade-off, one concrete outcome. No throat-clearing, no list of achievements, no over-polished phrasing. Cut anything that isn't load-bearing. Should feel like a senior operator who knows exactly what to say and stops.",
              },
            },
            required: ["foundation", "strong", "standout"],
            additionalProperties: false,
          },
          coach_insight: {
            type: "object",
            description: "OPTIONAL expert annotation. Only populate on 3–5 of the most pivotal questions in the whole pack (typically inside positions 1–10). Leave null on every other question. Each field is ONE short sentence — together the three lines must be readable in under 15 seconds.",
            properties: {
              really_testing: {
                type: "string",
                description: "What the interviewer is really testing beneath the surface of the question. One sentence, ≤ 22 words.",
              },
              common_mistake: {
                type: "string",
                description: "The single most common mistake candidates make on this question. One sentence, ≤ 22 words.",
              },
              how_to_approach: {
                type: "string",
                description: "How a strong candidate should approach the answer. One sentence, ≤ 22 words.",
              },
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
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let userId: string | null = null;
  let sessionId: string | null = null;

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = userData.user.id;
    logRequest(req, userId, "generate-interview-pack").catch(() => {});
    evaluateAccount(userId).catch(() => {});

    const body = await req.json().catch(() => ({}));
    sessionId = body.session_id ?? null;
    if (!sessionId) throw new Error("session_id is required");

    // Load the session row (server-trusted source of truth) and authorise it.
    const { data: session, error: sErr } = await admin
      .from("prep_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== Single-candidate enforcement =====
    // Each account is locked to one named candidate. Sessions whose candidate
    // name or CV refer to a different person are hard-blocked AND flagged.
    const { data: profile } = await admin
      .from("profiles")
      .select("candidate_full_name")
      .eq("id", userId)
      .maybeSingle();

    const lockedName = (profile?.candidate_full_name ?? "").trim();
    if (lockedName) {
      const sessionName = (session.full_name ?? "").trim();
      const nameMatches = sessionName ? namesLooselyMatch(lockedName, sessionName) : true;
      const cvMatches = session.cv_text ? cvMentionsName(session.cv_text, lockedName) : true;

      if (!nameMatches || !cvMatches) {
        const reason = !nameMatches ? "candidate_name_mismatch" : "cv_name_mismatch";
        const evidence = {
          locked_candidate: lockedName,
          session_id: sessionId,
          session_full_name: sessionName || null,
          normalised_locked: normaliseName(lockedName),
          normalised_session: normaliseName(sessionName),
          name_matches: nameMatches,
          cv_matches: cvMatches,
        };
        // Best-effort insert: a partial unique index keeps one open flag per user.
        await admin.from("account_flags")
          .insert({ user_id: userId, reason, evidence, status: "open" })
          .then(() => null, () => null);
        await admin.from("admin_logs").insert({
          event: "account_flagged_multi_candidate",
          metadata: { user_id: userId, reason, ...evidence },
        });
        await admin.from("prep_sessions").update({ status: "blocked" }).eq("id", sessionId);
        return new Response(
          JSON.stringify({
            error: "CANDIDATE_LOCK_VIOLATION",
            reason,
            locked_candidate: lockedName,
            message: `This account is locked to ${lockedName}. Sessions or CVs for a different candidate aren't allowed. Contact support to change the named candidate.`,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ===== Server-side plan enforcement =====

    // Resolve the user's effective plan via the security-definer helper.
    // Free users: max 1 non-draft session ever.
    const env = (req.headers.get("x-stripe-env") === "live") ? "live" : "sandbox";
    const { data: planData } = await admin.rpc("get_user_plan", {
      _user_id: userId,
      _env: env,
    });
    const userPlan: "free" | "pro" | "coach_plus" = (planData as any) ?? "free";
    const isPaid = userPlan === "pro" || userPlan === "coach_plus";

    if (!isPaid) {
      // Count non-draft sessions excluding this one. If >=1, block.
      const { count: usedSessions } = await admin
        .from("prep_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .neq("status", "draft")
        .neq("id", sessionId);
      if ((usedSessions ?? 0) >= 1) {
        return new Response(
          JSON.stringify({
            error: "FREE_SESSION_LIMIT",
            message: "You've used your free session. Upgrade to Pro for unlimited prep.",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ===== Pro distinct-role cap (target_role + company_name) =====
    if (userPlan === "pro") {
      const usage = await getProUsage(admin, userId);
      if (usage) {
        const sessRole = (session.target_role ?? "").trim().toLowerCase();
        const sessCompany = (session.company_name ?? "").trim().toLowerCase();
        // Does this (role, company) tuple already exist among this user's
        // non-draft sessions in the current period?
        const { data: matching } = await admin
          .from("prep_sessions")
          .select("id, target_role, company_name")
          .eq("user_id", userId)
          .neq("status", "draft")
          .neq("id", sessionId)
          .gte("created_at", usage.period_start)
          .lt("created_at", usage.period_end);

        const tupleAlreadyCounted = (matching ?? []).some(
          (r) =>
            (r.target_role ?? "").trim().toLowerCase() === sessRole &&
            (r.company_name ?? "").trim().toLowerCase() === sessCompany,
        );

        const isNewTuple = !tupleAlreadyCounted && sessRole.length > 0;
        if (isNewTuple && usage.distinct_roles >= PRO_LIMITS.distinctRolesPerPeriod) {
          const block = buildLimitBlock(
            "distinctRolesPerPeriod",
            usage.distinct_roles,
            usage.period_end,
          );
          await admin.from("prep_sessions").update({ status: "blocked" }).eq("id", sessionId);
          return new Response(JSON.stringify(block), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const numQuestions = Math.max(20, Math.min(120, session.num_questions ?? 100));

    await admin.from("prep_sessions").update({ status: "generating" }).eq("id", sessionId);

    // Wipe any prior questions for this session so retries don't duplicate.
    await admin.from("interview_questions").delete().eq("session_id", sessionId);
    await admin.from("generated_interview_packs").delete().eq("session_id", sessionId);

    // Create the generation job row up-front.
    const { data: jobRow, error: jobErr } = await admin
      .from("generation_jobs")
      .insert({
        session_id: sessionId,
        user_id: userId,
        workspace_id: session.workspace_id ?? null,
        status: "queued",
        current_stage: "Preparing",
        progress_percentage: 0,
        questions_generated: 0,
        total_questions: numQuestions,
      })
      .select("id")
      .single();
    if (jobErr) throw jobErr;
    const jobId: string = jobRow.id;

    const updateJob = async (patch: Record<string, unknown>) => {
      await admin.from("generation_jobs").update(patch).eq("id", jobId);
    };

    // Plan chunks: priority preview chunk (1–10), then 30-question chunks.
    const PREVIEW_SIZE = Math.min(10, numQuestions);
    const REMAINING = numQuestions - PREVIEW_SIZE;
    const CHUNK_SIZE = 30;
    const chunkRanges: Array<{ start: number; end: number; label: string }> = [];
    if (PREVIEW_SIZE > 0) {
      chunkRanges.push({ start: 1, end: PREVIEW_SIZE, label: `Writing the high-stakes opening (1–${PREVIEW_SIZE})` });
    }
    let cursor = PREVIEW_SIZE + 1;
    while (cursor <= numQuestions) {
      const end = Math.min(numQuestions, cursor + CHUNK_SIZE - 1);
      chunkRanges.push({ start: cursor, end, label: `Writing questions ${cursor}–${end}` });
      cursor = end + 1;
    }

    const generate = async () => {
      try {
        await updateJob({ status: "processing", current_stage: "Preparing", progress_percentage: 2 });

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
- "answer_direction" is short, sharp, practical coaching for delivery — not content. Keep "structure" to one sentence, "length" to a concrete time/size cue, and "avoid" to 2-4 specific traps phrased as quick warnings ("Don't ramble through context", "Avoid 'we' — own the action", "Skip the jargon, give the proof"). Tailor to the question type — behavioural answers need STAR-style shape; opinion or commercial questions need a clear stance + rationale; technical answers need brevity and a worked example.
- "example_answers" gives THREE tiers: foundation, strong, standout. These are SPOKEN answers, not written prose. Read them out loud — they should sound like a real candidate talking, with natural rhythm, contractions, the occasional connecting phrase ("So…", "Honestly,", "The way I think about it…"). No bullet points, no headings, no markdown. Use first person ("I"). Reference specifics from the CV/role wherever possible. Tier intent:
  • foundation = clear, simple, direct. A solid baseline answer a junior or nervous candidate could deliver well.
  • strong = structured, confident, commercially aware. Tight ownership, a concrete example or number, a clear "so what".
  • standout = 20–30 seconds spoken (50–75 words, never more than 80). Sharp, controlled, intentional. One pointed opening line, one crisp judgement or trade-off, one concrete outcome — then stop. Not verbose. Not over-polished. Cut every word that isn't load-bearing. It should feel like restraint, not performance.
- Avoid jargon unless the role demands it. Never use the words "basic", "intermediate", "advanced".
- Position numbers are 1-based and sequential.

CRITICAL — THE FIRST 10 QUESTIONS (positions 1–10):
These ten questions are the only thing many candidates will ever see. They MUST feel uncomfortably accurate — the candidate should think "how do they know that?" Every one of the first 10 must reference a specific, named detail from the CV, the job description, or the company (a role title, employer, project, gap, transition, claim, number, or stated requirement). No generic openers. No filler. No "tell me about yourself" unless it is sharpened with a specific angle from their CV.

The first 10 must include AT LEAST this category mix (positions can be in any order within 1–10):
  • 2 × CV/Background — challenging questions that probe specific claims, transitions, gaps, or numbers from the CV. Pick the two most exposed or interesting items in this CV.
  • 2 × Behavioural — STAR-style questions tied to a real scenario this candidate has plausibly faced given their CV.
  • 2 × Role-Fit — questions that test fit against named requirements in this job description.
  • 1 × Pressure — a sharp, slightly destabilising question (a challenge to a claim, a gap, a contradiction, or a hard hypothetical from the role). It should make a confident candidate pause.
  • 1 × Company Motivation — the "why you / why us" question, made specific (reference the company, product, mission, or a public detail if mentioned in the spec).
The remaining 2 slots in the first 10 should be the next-most-revealing categories for THIS candidate (typically Weaknesses, Leadership, Stakeholder, or Commercial Awareness — pick what exposes the most signal).

Do NOT pad the first 10 with Opening pleasantries, Closing questions, or generic Strengths prompts. Save those for later in the pack.
After position 10, distribute the remaining categories naturally across the interview arc.

COACH INSIGHTS (selective):
Choose EXACTLY 3–5 of the most pivotal questions in the entire pack and attach a "coach_insight" object to each. Pick the questions a coach would most want to flag — typically the Pressure question, the toughest CV/Background probe, the sharpest Behavioural, the Company Motivation question, and one more if warranted. Strongly prefer questions inside positions 1–10. Every other question MUST omit "coach_insight" entirely (do not include the field, do not return null padding). Each insight has three single-sentence fields, each ≤ 22 words: what the interviewer is really testing, the most common mistake, and how a strong candidate should approach it. Concrete, specific to this question — never generic.`;

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

        // Schema variant for chunked calls — require only `questions` (and optionally summary fields on the first chunk).
        const buildChunkSchema = (includeSummary: boolean) => {
          const props: any = {
            questions: QUESTION_SCHEMA.properties.questions,
          };
          const required: string[] = ["questions"];
          if (includeSummary) {
            props.candidate_summary = QUESTION_SCHEMA.properties.candidate_summary;
            props.role_summary = QUESTION_SCHEMA.properties.role_summary;
            props.top_themes = QUESTION_SCHEMA.properties.top_themes;
            props.red_flag_areas = QUESTION_SCHEMA.properties.red_flag_areas;
            required.push("candidate_summary", "role_summary", "top_themes", "red_flag_areas");
          }
          return {
            type: "object",
            properties: props,
            required,
            additionalProperties: false,
          };
        };

        // Resolve workspace_id from the session.
        const wsId = session.workspace_id ?? null;

        // Track summary captured on first chunk so we can persist a pack.
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

          await updateJob({
            current_stage: range.label,
            progress_percentage: Math.max(2, Math.round((ci / totalChunks) * 90) + 2),
          });

          const chunkInstruction = isFirst
            ? `This is CHUNK 1 of ${totalChunks}. Generate ONLY positions ${range.start}–${range.end} of the full ${numQuestions}-question pack. These are the high-stakes opening questions — apply the FIRST 10 rules strictly. Also return the overall candidate_summary, role_summary, top_themes, and red_flag_areas for the whole pack (these are written once, not per chunk).`
            : `This is CHUNK ${ci + 1} of ${totalChunks}. Generate ONLY positions ${range.start}–${range.end} of the full ${numQuestions}-question pack. Do NOT repeat earlier positions. Distribute categories naturally across the interview arc — these are mid/late questions, so include a mix of Behavioural, Strengths, Weaknesses, Leadership, Stakeholder, Problem-Solving, Commercial Awareness, Technical, and Closing as appropriate. Coach insights: only attach if you'd genuinely flag this question (most should omit it).`;

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
            // Mirror the summary onto the session early so Results can show context.
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

          // Insert this chunk (in sub-chunks of 50 if huge).
          for (let i = 0; i < rows.length; i += 50) {
            const sub = rows.slice(i, i + 50);
            const { error } = await admin.from("interview_questions").insert(sub);
            if (error) console.error("question insert error", error);
          }

          totalGenerated += rows.length;

          await updateJob({
            questions_generated: totalGenerated,
            progress_percentage: Math.min(95, Math.round(((ci + 1) / totalChunks) * 90) + 2),
          });
        }

        // Persist final pack record.
        const { data: pack, error: pErr } = await admin
          .from("generated_interview_packs")
          .insert({
            user_id: userId,
            session_id: sessionId,
            workspace_id: wsId,
            status: "ready",
            candidate_summary: summary.candidate_summary,
            role_summary: summary.role_summary,
            top_themes: summary.top_themes,
            red_flags: summary.red_flag_areas,
            total_questions: totalGenerated,
            model: MODEL,
            prompt_version: PROMPT_VERSION,
          })
          .select()
          .single();
        if (pErr) throw pErr;

        await admin.from("prep_sessions").update({ status: "ready" }).eq("id", sessionId);

        await updateJob({
          status: "completed",
          progress_percentage: 100,
          current_stage: "Completed",
          questions_generated: totalGenerated,
          completed_at: new Date().toISOString(),
        });

        await admin.from("admin_logs").insert({
          event: "pack_generated",
          metadata: { user_id: userId, session_id: sessionId, pack_id: pack.id, count: totalGenerated, model: MODEL, chunks: totalChunks },
        });
      } catch (e: any) {
        const message = e?.message ?? String(e);
        console.error("generation failed", message);
        await admin.from("prep_sessions").update({ status: "failed" }).eq("id", sessionId);
        await updateJob({
          status: "failed",
          error_message: message.slice(0, 500),
          completed_at: new Date().toISOString(),
        });
        await admin.from("admin_logs").insert({
          event: "pack_generation_failed",
          metadata: { user_id: userId, session_id: sessionId, job_id: jobId, error: message },
        });
      }
    };

    // Run in background so the client returns quickly
    // @ts-ignore EdgeRuntime
    EdgeRuntime.waitUntil(generate());

    return new Response(
      JSON.stringify({ ok: true, status: "queued", session_id: sessionId, job_id: jobId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    const message = e?.message ?? String(e);
    console.error("generate-interview-pack error", message);
    try {
      await admin.from("admin_logs").insert({
        event: "pack_generation_failed",
        metadata: { user_id: userId, session_id: sessionId, error: message },
      });
    } catch (_) {}
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
