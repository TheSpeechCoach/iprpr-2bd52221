import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an expert UK interview coach. You critique a candidate's spoken interview answer with directness, warmth and craft.

Your job:
- Evaluate the answer against the question and the candidate/role context.
- Reward clear thinking, relevant examples, grounded confidence, concise delivery, credible character, ownership of language and mature judgement.
- Do NOT over-polish. Do NOT remove the candidate's natural voice. Do NOT force STAR every time. Do NOT reward corporate jargon. Do NOT punish individuality where it is appropriate.
- Recognise personal voice, professional context, individuality, appropriate confidence and natural phrasing.
- Score 1-10 on each dimension where 1 is weak and 10 is interview-winning.
- Use UK English. Tone: direct, constructive, never patronising, accessible but not dumbed down.

Return ONLY via the score_answer tool.`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI not configured" }, 500);

    // Auth user via anon client with caller's JWT
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const { question_id, saved_answer_id, prep_session_id } = body ?? {};
    if (!question_id || !saved_answer_id || !prep_session_id) {
      return json({ error: "Missing question_id, saved_answer_id or prep_session_id" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Plan check — Free users get a monthly evaluation allowance, paid keep
    // existing access. Honour testing override via get_user_plan.
    const FREE_EVALUATION_LIMIT = 2;
    const { data: planRow } = await admin.rpc("get_user_plan", { _user_id: user.id, _env: "sandbox" });
    const { data: planRowLive } = await admin.rpc("get_user_plan", { _user_id: user.id, _env: "live" });
    const isCoachPlus = planRow === "coach_plus" || planRowLive === "coach_plus";
    const isPro = planRow === "pro" || planRowLive === "pro";
    const isPaid = isCoachPlus || isPro;

    // Calendar-month period start (UTC) used as the bucket key.
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);

    let usageRow: { id: string; evaluations_used: number } | null = null;
    if (!isPaid) {
      const { data: existing } = await admin
        .from("answer_evaluation_usage")
        .select("id, evaluations_used")
        .eq("user_id", user.id)
        .eq("period_start", periodStart)
        .maybeSingle();
      const used = existing?.evaluations_used ?? 0;
      if (used >= FREE_EVALUATION_LIMIT) {
        return json({
          error:
            "You've used your 2 free evaluations this month. Upgrade to continue receiving AI feedback.",
          code: "FREE_EVALUATION_LIMIT_REACHED",
          evaluations_used: used,
          evaluations_limit: FREE_EVALUATION_LIMIT,
        }, 402);
      }
      usageRow = (existing as any) ?? null;
    }

    // Load question + saved answer + session context
    const { data: question, error: qErr } = await admin
      .from("interview_questions")
      .select("id, question, category, difficulty, why_matters, what_good_covers, follow_up, user_id")
      .eq("id", question_id)
      .maybeSingle();
    if (qErr || !question || question.user_id !== user.id) {
      return json({ error: "Question not found" }, 404);
    }

    const { data: saved, error: sErr } = await admin
      .from("saved_answers")
      .select("id, answer_text, user_id, prep_session_id")
      .eq("id", saved_answer_id)
      .maybeSingle();
    if (sErr || !saved || saved.user_id !== user.id) {
      return json({ error: "Saved answer not found" }, 404);
    }
    if (!saved.answer_text || saved.answer_text.trim().length < 10) {
      return json({ error: "Write a longer answer before scoring." }, 400);
    }

    const { data: session } = await admin
      .from("prep_sessions")
      .select("role_summary, candidate_summary, target_role, company_name, seniority_level")
      .eq("id", prep_session_id)
      .maybeSingle();

    const userPrompt = [
      `QUESTION (${question.category}${question.difficulty ? `, ${question.difficulty}` : ""}):`,
      question.question,
      question.why_matters ? `\nWhy it matters: ${question.why_matters}` : "",
      question.what_good_covers ? `What good answers cover: ${question.what_good_covers}` : "",
      session?.target_role ? `\nROLE: ${session.target_role}${session.company_name ? ` at ${session.company_name}` : ""}${session.seniority_level ? ` (${session.seniority_level})` : ""}` : "",
      session?.role_summary ? `Role summary: ${session.role_summary}` : "",
      session?.candidate_summary ? `Candidate summary: ${session.candidate_summary}` : "",
      `\nCANDIDATE'S ANSWER:\n${saved.answer_text}`,
    ].filter(Boolean).join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "score_answer",
            description: "Return a structured critique of the candidate's interview answer.",
            parameters: {
              type: "object",
              properties: {
                overall_score: { type: "integer", minimum: 1, maximum: 10 },
                clarity_score: { type: "integer", minimum: 1, maximum: 10 },
                structure_score: { type: "integer", minimum: 1, maximum: 10 },
                relevance_score: { type: "integer", minimum: 1, maximum: 10 },
                evidence_score: { type: "integer", minimum: 1, maximum: 10 },
                concision_score: { type: "integer", minimum: 1, maximum: 10 },
                authenticity_score: { type: "integer", minimum: 1, maximum: 10 },
                interview_impact_score: { type: "integer", minimum: 1, maximum: 10 },
                what_works: { type: "string" },
                needs_improving: { type: "string" },
                what_to_remove: { type: "string" },
                make_more_specific: { type: "string" },
                stronger_version: { type: "string" },
              },
              required: [
                "overall_score","clarity_score","structure_score","relevance_score",
                "evidence_score","concision_score","authenticity_score","interview_impact_score",
                "what_works","needs_improving","what_to_remove","make_more_specific","stronger_version",
              ],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "score_answer" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: "Rate limit hit, try again shortly." }, 429);
      if (aiResp.status === 402) return json({ error: "AI credits exhausted." }, 402);
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return json({ error: "Scoring failed" }, 500);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return json({ error: "Scoring returned no result" }, 500);
    }
    const args = JSON.parse(toolCall.function.arguments);

    const feedback = {
      what_works: args.what_works,
      needs_improving: args.needs_improving,
      what_to_remove: args.what_to_remove,
      make_more_specific: args.make_more_specific,
      stronger_version: args.stronger_version,
    };

    const { data: inserted, error: insErr } = await admin
      .from("answer_scores")
      .insert({
        user_id: user.id,
        prep_session_id,
        question_id,
        saved_answer_id,
        overall_score: args.overall_score,
        clarity_score: args.clarity_score,
        structure_score: args.structure_score,
        relevance_score: args.relevance_score,
        evidence_score: args.evidence_score,
        concision_score: args.concision_score,
        authenticity_score: args.authenticity_score,
        interview_impact_score: args.interview_impact_score,
        feedback_json: feedback,
      })
      .select()
      .single();

    if (insErr) {
      console.error("insert error", insErr);
      return json({ error: "Could not save score" }, 500);
    }

    // Increment Free monthly usage after a successful evaluation.
    let evaluationsRemaining: number | null = null;
    if (!isPaid) {
      if (usageRow) {
        const newUsed = (usageRow.evaluations_used ?? 0) + 1;
        await admin
          .from("answer_evaluation_usage")
          .update({ evaluations_used: newUsed })
          .eq("id", usageRow.id);
        evaluationsRemaining = Math.max(0, FREE_EVALUATION_LIMIT - newUsed);
      } else {
        await admin
          .from("answer_evaluation_usage")
          .insert({ user_id: user.id, period_start: periodStart, evaluations_used: 1 });
        evaluationsRemaining = FREE_EVALUATION_LIMIT - 1;
      }
    }

    return json({
      score: inserted,
      plan_tier: isCoachPlus ? "coach_plus" : isPro ? "pro" : "free",
      evaluations_limit: isPaid ? null : FREE_EVALUATION_LIMIT,
      evaluations_remaining: evaluationsRemaining,
    });
  } catch (e) {
    console.error("score-answer error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
