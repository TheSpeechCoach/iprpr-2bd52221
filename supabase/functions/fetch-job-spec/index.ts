// Fetch and structure a public job spec URL using Firecrawl + Lovable AI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ukifyJson } from "../_shared/ukEnglish.ts";
import { PRO_LIMITS, getProUsage, getUserPlan, buildLimitBlock } from "../_shared/proLimits.ts";
import { logRequest } from "../_shared/requestAudit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

function normaliseWhitespace(s: string): string {
  return s.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

const EMPTY = {
  job_title: "",
  company_name: "",
  responsibilities: [] as string[],
  required_skills: [] as string[],
  preferred_skills: [] as string[],
  behavioural_competencies: [] as string[],
  leadership_scope: "",
  raw_text: "",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let userId: string | null = null;
  let url: string | null = null;
  let sessionId: string | null = null;

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY is not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json().catch(() => ({}));
    url = (body.url ?? "").toString().trim();
    sessionId = (body.session_id ?? null) as string | null;

    if (!url || !isHttpUrl(url) || url.length > 2048) {
      return new Response(JSON.stringify({ error: "Provide a valid http(s) URL" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== Pro plan job-spec cap =====
    const env = (req.headers.get("x-stripe-env") === "live") ? "live" : "sandbox";
    const userPlan = await getUserPlan(admin, userId, env);
    if (userPlan === "pro") {
      const usage = await getProUsage(admin, userId);
      if (usage && usage.job_specs >= PRO_LIMITS.jobSpecsPerPeriod) {
        const block = buildLimitBlock(
          "jobSpecsPerPeriod",
          usage.job_specs,
          usage.period_end,
        );
        return new Response(JSON.stringify(block), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 1) Firecrawl scrape
    const fcResp = await fetch(FIRECRAWL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });

    if (!fcResp.ok) {
      const t = await fcResp.text();
      throw new Error(`Firecrawl ${fcResp.status}: ${t.slice(0, 300)}`);
    }
    const fc = await fcResp.json();
    const markdown: string =
      fc?.data?.markdown ?? fc?.markdown ?? fc?.data?.content ?? "";
    const sourceTitle: string =
      fc?.data?.metadata?.title ?? fc?.metadata?.title ?? "";

    const rawText = normaliseWhitespace(markdown);
    if (!rawText || rawText.length < 200) {
      throw new Error("Firecrawl returned little or no readable content.");
    }

    // 2) Structure with Lovable AI
    const system = `You extract structured job-spec data from raw markdown. Return ONLY valid JSON with this shape:
{
  "job_title": "",
  "company_name": "",
  "responsibilities": [],
  "required_skills": [],
  "preferred_skills": [],
  "behavioural_competencies": [],
  "leadership_scope": ""
}
Rules: arrays must be string lists of concise points. leadership_scope is a 1-2 sentence summary (e.g. team size, budget, span). Use British English (en-GB) only — UK spellings (organisation, behaviour, programme, optimise, recognise, analyse, centre, licence as noun, practise as verb), no Americanisms. Empty string or empty array if unknown.`;

    const aiResp = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Page title: ${sourceTitle || "—"}\nSource URL: ${url}\n\nMARKDOWN:\n${rawText.slice(0, 18000)}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      throw new Error(`AI ${aiResp.status}: ${t.slice(0, 300)}`);
    }
    const aiJson = await aiResp.json();
    const content: string = aiJson?.choices?.[0]?.message?.content ?? "";
    let parsed: any = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error("AI did not return JSON.");
    }

    const result = ukifyJson({
      job_title: String(parsed.job_title ?? "").trim(),
      company_name: String(parsed.company_name ?? "").trim(),
      responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities.map(String) : [],
      required_skills: Array.isArray(parsed.required_skills) ? parsed.required_skills.map(String) : [],
      preferred_skills: Array.isArray(parsed.preferred_skills) ? parsed.preferred_skills.map(String) : [],
      behavioural_competencies: Array.isArray(parsed.behavioural_competencies) ? parsed.behavioural_competencies.map(String) : [],
      leadership_scope: String(parsed.leadership_scope ?? "").trim(),
      raw_text: rawText,
    });

    // 3) Persist (best-effort)
    try {
      const { data: jobInput } = await admin
        .from("job_inputs")
        .insert({
          user_id: userId,
          session_id: sessionId,
          input_type: "url",
          job_spec_url: url,
          job_title: result.job_title || null,
          company_name: result.company_name || null,
          job_description: result.raw_text,
        })
        .select()
        .single();

      await admin.from("extracted_job_specs").insert({
        user_id: userId,
        session_id: sessionId,
        job_input_id: jobInput?.id ?? null,
        summary: result.leadership_scope || null,
        responsibilities: result.responsibilities,
        requirements: {
          required: result.required_skills,
          preferred: result.preferred_skills,
          behavioural: result.behavioural_competencies,
        },
        skills: result.required_skills,
        raw: { source: "firecrawl", url },
      });
    } catch (persistErr) {
      console.error("persist job spec failed", persistErr);
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    const message = e?.message ?? String(e);
    console.error("fetch-job-spec error", message);
    try {
      await admin.from("admin_logs").insert({
        event: "job_spec_fetch_failed",
        metadata: { user_id: userId, url, session_id: sessionId, error: message },
      });
    } catch (_) {}
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Could not extract from URL. Please paste the job description manually.",
        detail: message,
        ...EMPTY,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
