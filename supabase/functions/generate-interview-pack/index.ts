// Generate interview pack via Lovable AI Gateway
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { session_id } = await req.json();
    if (!session_id) throw new Error("Missing session_id");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load session
    const { data: session, error: sErr } = await admin
      .from("prep_sessions")
      .select("*")
      .eq("id", session_id)
      .eq("user_id", user.id)
      .single();
    if (sErr || !session) throw new Error("Session not found");

    // Kick off generation in the background so the client can return quickly
    const generate = async () => {
      try {
        const systemPrompt = `You are a senior interview coach for The Speech Coach, helping candidates prepare for real-world job interviews. Use British English. Be specific, realistic and avoid hype. Generate questions a smart interviewer would actually ask.

Return ONLY valid JSON (no markdown) with this exact shape:
{
  "candidate_summary": "string, 2-3 sentences",
  "role_summary": "string, 2-3 sentences",
  "top_themes": ["string", ...],
  "red_flags": ["string", ...],
  "questions": [
    {
      "position": 1,
      "category": "Opening",
      "question": "string",
      "why_matters": "string",
      "what_good_covers": "string",
      "follow_up": "string or empty",
      "answer_framework": "string or empty",
      "difficulty": "easy|medium|hard"
    }
  ]
}

Use these categories (distribute roughly): Opening, CV/Background, Role-Fit, Behavioural, Strengths, Weaknesses, Leadership, Stakeholder, Problem-Solving, Company Motivation, Commercial Awareness, Pressure, Closing.`;

        const userPrompt = `Generate ${session.num_questions} tailored interview questions.

CANDIDATE:
- Name: ${session.full_name || "—"}
- Current role: ${session.candidate_current_role || "—"}
- Years experience: ${session.years_experience || "—"}
- Target role: ${session.target_role}
- Industry: ${session.target_industry || "—"}
- Seniority: ${session.seniority_level}
- Country: ${session.country}
- Notes: ${session.candidate_notes || "—"}
- CV: ${(session.cv_text || "").slice(0, 6000) || "Not provided"}
- LinkedIn summary: ${(session.linkedin_text || "").slice(0, 2000) || "Not provided"}

ROLE:
- Job title: ${session.job_title || session.target_role}
- Company: ${session.company_name || "—"}
- Description: ${(session.job_description || "").slice(0, 6000) || "Not provided"}

PARAMETERS:
- Interview type: ${session.interview_type}
- Difficulty: ${session.difficulty}
- Tone: ${session.output_tone}
- Style: ${session.interview_style}
- Focus mix: ${JSON.stringify(session.focus_mix)}
- Include follow-ups: ${session.include_followups}
- Include answer angles: ${session.include_answer_angles}

Be specific to this candidate's CV and the job description. No generic questions.`;

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-pro",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (!aiResp.ok) {
          const t = await aiResp.text();
          console.error("AI error", aiResp.status, t);
          await admin.from("prep_sessions").update({ status: "failed" }).eq("id", session_id);
          return;
        }

        const aiJson = await aiResp.json();
        const content = aiJson.choices?.[0]?.message?.content;
        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch (_) {
          // Attempt to recover JSON between braces
          const match = content?.match(/\{[\s\S]*\}/);
          parsed = match ? JSON.parse(match[0]) : null;
        }
        if (!parsed?.questions?.length) {
          console.error("No questions in AI output");
          await admin.from("prep_sessions").update({ status: "failed" }).eq("id", session_id);
          return;
        }

        await admin.from("prep_sessions").update({
          status: "ready",
          candidate_summary: parsed.candidate_summary ?? null,
          role_summary: parsed.role_summary ?? null,
          top_themes: parsed.top_themes ?? null,
          red_flags: parsed.red_flags ?? null,
        }).eq("id", session_id);

        const rows = parsed.questions.map((q: any, i: number) => ({
          session_id,
          user_id: user.id,
          position: q.position ?? i + 1,
          category: q.category ?? "General",
          question: q.question ?? "",
          why_matters: q.why_matters ?? null,
          what_good_covers: q.what_good_covers ?? null,
          follow_up: q.follow_up || null,
          answer_framework: q.answer_framework || null,
          difficulty: q.difficulty ?? null,
        }));

        // Insert in chunks of 50
        for (let i = 0; i < rows.length; i += 50) {
          const chunk = rows.slice(i, i + 50);
          const { error } = await admin.from("interview_questions").insert(chunk);
          if (error) console.error("Insert error", error);
        }

        await admin.from("admin_logs").insert({ event: "pack_generated", metadata: { session_id, count: rows.length } });
      } catch (e) {
        console.error("Generation failed", e);
        await admin.from("prep_sessions").update({ status: "failed" }).eq("id", session_id);
      }
    };

    // @ts-ignore EdgeRuntime
    EdgeRuntime.waitUntil(generate());

    return new Response(JSON.stringify({ ok: true, status: "generating" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
