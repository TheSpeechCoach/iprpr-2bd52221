// Orchestrator: validates auth, plan and candidate-lock, then queues a
// generation_jobs row and fire-and-forget invokes `process-generation-job`
// to do the actual chunked AI work. Returns { job_id } immediately so the
// frontend can begin polling.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
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

    // ===== TESTING_MODE bypass =====
    // When app_settings.testing_mode = true we relax commercial gates only:
    // single-candidate lock, free 1-session cap, and Pro distinct-role cap.
    // We do NOT relax auth, RLS, workspace scoping, or AI-server enforcement.
    let testingMode = false;
    try {
      const { data: tm } = await admin.rpc("testing_mode_enabled");
      testingMode = tm === true;
    } catch (_) { /* default off */ }
    if (testingMode) {
      console.log(`[generate-interview-pack] TESTING_MODE on — bypassing commercial limits for user ${userId}`);
    }

    // ===== Single-candidate enforcement =====
    // Each account is locked to one named candidate. Sessions whose candidate
    // name or CV refer to a different person are hard-blocked AND flagged.
    const { data: profile } = testingMode ? { data: null as any } : await admin
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
    // Free users: max 1 non-draft session per CALENDAR MONTH.
    const env = (req.headers.get("x-stripe-env") === "live") ? "live" : "sandbox";
    const { data: planData } = await admin.rpc("get_user_plan", {
      _user_id: userId,
      _env: env,
    });
    const userPlan: "free" | "pro" | "coach_plus" = (planData as any) ?? "free";
    const isPaid = userPlan === "pro" || userPlan === "coach_plus";

    if (!isPaid && !testingMode) {
      // Calendar-month window in UTC.
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
      const { count: usedSessions } = await admin
        .from("prep_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .neq("status", "draft")
        .neq("id", sessionId)
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd);
      if ((usedSessions ?? 0) >= 1) {
        return new Response(
          JSON.stringify({
            error: "FREE_SESSION_LIMIT",
            message: "You've reached your free limit for this month. Upgrade to Pro for unlimited prep.",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ===== Pro distinct-role cap (target_role + company_name) =====
    if (userPlan === "pro" && !testingMode) {
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

    // Hard product constraint: every pack is exactly 50 questions.
    const numQuestions = 50;

    // Mark the session generating and wipe any prior artefacts so retries
    // don't duplicate questions.
    await admin.from("prep_sessions").update({ status: "generating" }).eq("id", sessionId);
    await admin.from("interview_questions").delete().eq("session_id", sessionId);
    await admin.from("generated_interview_packs").delete().eq("session_id", sessionId);

    // Insert the generation_jobs row BEFORE invoking the worker so the
    // frontend can begin polling immediately on receiving job_id.
    const { data: jobRow, error: jobErr } = await admin
      .from("generation_jobs")
      .insert({
        prep_session_id: sessionId,
        user_id: userId,
        workspace_id: session.workspace_id ?? null,
        status: "queued",
        stage: "Queued",
        progress: 0,
      })
      .select("id")
      .single();
    if (jobErr) throw jobErr;
    const jobId: string = jobRow.id;
    console.log(`[generate-interview-pack] queued job ${jobId} for session ${sessionId} (n=${numQuestions})`);

    // Fire-and-forget invoke of the worker function. We do NOT await the
    // response — the worker runs in its own isolate and reports progress via
    // the generation_jobs row. We also do NOT use EdgeRuntime.waitUntil here:
    // the request to the worker is the trigger, and the worker's own
    // isolate keeps itself alive for the duration of generation.
    const workerUrl = `${SUPABASE_URL}/functions/v1/process-generation-job`;
    fetch(workerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ job_id: jobId }),
    }).catch((err) => {
      // Best-effort log only — the worker may have started successfully even
      // if the connection from this isolate dropped early.
      console.error(`[generate-interview-pack] worker invoke error for job ${jobId}:`, err?.message ?? err);
    });

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
