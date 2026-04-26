// Generate a tailored interview pack via Lovable AI Gateway.
// Auth required. Strict JSON via tool-calling. Persists pack + questions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-pro";
const PROMPT_VERSION = "v4-2026-04-26-answer-tiers";

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
                description: "Strong tier. Structured, confident, commercially aware. Tight delivery, clear ownership ('I'), one concrete example or number. Spoken. 60–110 words.",
              },
              standout: {
                type: "string",
                description: "Standout tier. Concise, high-impact, leadership-level, differentiated. A sharp opening line, a crisp insight or principle, an outcome that signals seniority. Spoken. 60–110 words.",
              },
            },
            required: ["foundation", "strong", "standout"],
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

    const numQuestions = Math.max(20, Math.min(120, session.num_questions ?? 100));

    await admin.from("prep_sessions").update({ status: "generating" }).eq("id", sessionId);

    const generate = async () => {
      try {
        const systemPrompt = `You are a senior UK-based interview coach for The Speech Coach. You write in British English.
Your job: generate sharp, realistic, interview-grade questions tailored to a specific candidate and role.

Hard rules:
- No generic filler. Every question must reference something specific from the CV, the role, or the company context.
- Questions must read as if a real, experienced interviewer wrote them.
- Calibrate difficulty mix to the seniority and chosen difficulty level.
- Distribute categories across the interview arc (Opening → Closing).
- Use British English spelling and idiom.
- "why_this_question_matters" explains the interviewer's intent in one tight sentence.
- "what_good_answers_should_cover" lists the substance a strong answer should hit (2-4 concrete points).
- "optional_follow_up" is a sharp probing follow-up the interviewer might use; empty string if none.
- "answer_direction" is short, sharp, practical coaching for delivery — not content. Keep "structure" to one sentence, "length" to a concrete time/size cue, and "avoid" to 2-4 specific traps phrased as quick warnings ("Don't ramble through context", "Avoid 'we' — own the action", "Skip the jargon, give the proof"). Tailor to the question type — behavioural answers need STAR-style shape; opinion or commercial questions need a clear stance + rationale; technical answers need brevity and a worked example.
- Position numbers are 1-based and sequential.`;

        const userPrompt = `Generate exactly ${numQuestions} interview questions.

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

INTERVIEW PARAMETERS
- Interview type: ${session.interview_type}
- Difficulty: ${session.difficulty}
- Tone: ${session.output_tone}
- Style: ${session.interview_style}
- Focus mix (rough %): ${JSON.stringify(session.focus_mix)}
- Include follow-ups: ${session.include_followups}
- Include answer framework: ${session.include_answer_angles}

Return the result by calling the produce_interview_pack tool. Do not write any prose outside the tool call.`;

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
                description: "Return the structured interview pack.",
                parameters: QUESTION_SCHEMA,
              },
            }],
            tool_choice: { type: "function", function: { name: "produce_interview_pack" } },
          }),
        });

        if (!aiResp.ok) {
          const t = await aiResp.text();
          let label = "AI gateway error";
          if (aiResp.status === 429) label = "Rate limit hit. Try again shortly.";
          if (aiResp.status === 402) label = "Lovable AI credits exhausted.";
          await admin.from("prep_sessions").update({ status: "failed" }).eq("id", sessionId);
          await admin.from("admin_logs").insert({
            event: "pack_generation_failed",
            metadata: { user_id: userId, session_id: sessionId, status: aiResp.status, error: t.slice(0, 500), label },
          });
          return;
        }

        const aiJson = await aiResp.json();
        const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
        const argsRaw = toolCall?.function?.arguments;
        if (!argsRaw) throw new Error("AI returned no tool call");

        let parsed: any;
        try {
          parsed = typeof argsRaw === "string" ? JSON.parse(argsRaw) : argsRaw;
        } catch {
          throw new Error("AI tool arguments were not valid JSON");
        }

        const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
        if (!questions.length) throw new Error("AI returned no questions");

        // Persist pack
        const { data: pack, error: pErr } = await admin
          .from("generated_interview_packs")
          .insert({
            user_id: userId,
            session_id: sessionId,
            status: "ready",
            candidate_summary: parsed.candidate_summary ?? null,
            role_summary: parsed.role_summary ?? null,
            top_themes: parsed.top_themes ?? [],
            red_flags: parsed.red_flag_areas ?? [],
            total_questions: questions.length,
            model: MODEL,
            prompt_version: PROMPT_VERSION,
          })
          .select()
          .single();
        if (pErr) throw pErr;

        // Mirror summary onto the session for the Results page
        await admin.from("prep_sessions").update({
          status: "ready",
          candidate_summary: parsed.candidate_summary ?? null,
          role_summary: parsed.role_summary ?? null,
          top_themes: parsed.top_themes ?? [],
          red_flags: parsed.red_flag_areas ?? [],
        }).eq("id", sessionId);

        // Insert questions in chunks
        const rows = questions.map((q: any, i: number) => ({
          session_id: sessionId,
          user_id: userId,
          position: Number.isInteger(q.position) ? q.position : i + 1,
          category: q.category ?? "General",
          question: q.question ?? "",
          why_matters: q.why_this_question_matters ?? null,
          what_good_covers: q.what_good_answers_should_cover ?? null,
          follow_up: q.optional_follow_up || null,
          answer_framework: q.answer_framework || null,
          answer_direction: q.answer_direction ?? null,
          difficulty: q.difficulty ?? null,
        }));

        for (let i = 0; i < rows.length; i += 50) {
          const chunk = rows.slice(i, i + 50);
          const { error } = await admin.from("interview_questions").insert(chunk);
          if (error) console.error("question insert error", error);
        }

        await admin.from("admin_logs").insert({
          event: "pack_generated",
          metadata: { user_id: userId, session_id: sessionId, pack_id: pack.id, count: rows.length, model: MODEL },
        });
      } catch (e: any) {
        const message = e?.message ?? String(e);
        console.error("generation failed", message);
        await admin.from("prep_sessions").update({ status: "failed" }).eq("id", sessionId);
        await admin.from("admin_logs").insert({
          event: "pack_generation_failed",
          metadata: { user_id: userId, session_id: sessionId, error: message },
        });
      }
    };

    // Run in background so the client returns quickly
    // @ts-ignore EdgeRuntime
    EdgeRuntime.waitUntil(generate());

    return new Response(
      JSON.stringify({ ok: true, status: "generating", session_id: sessionId }),
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
