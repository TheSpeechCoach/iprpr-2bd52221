// Researches the organisation/institution/host that a candidate is preparing
// for and stores a structured summary on `prep_sessions.organisation_research`.
// Authenticated; user must own (or be a workspace member of) the prep_session.
//
// Behaviour:
// - Uses the supplied job spec / context text as the primary source of truth.
// - If FIRECRAWL_API_KEY is configured, attempts a small web search + scrape
//   to enrich the summary with public information.
// - Always falls back to a "limited" status if web research is unavailable or
//   fails — never blocks generation, never invents facts.
// - Track-aware: prompt biases what to extract for professional / scholar /
//   grad / media tracks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

type Track = "professional" | "academic" | "graduate" | "media";

const TRACK_RESEARCH_GUIDANCE: Record<Track, string> = {
  professional:
    "Focus on: company background, sector, products/services, leadership, values, recent news, likely interview format and stages, known interview techniques, and role-specific expectations.",
  graduate:
    "Focus on: graduate scheme structure, assessment centre style, competency framework, values-based interview approach, likely psychometric / group / case exercises, and early-career expectations.",
  academic:
    "Focus on: school / university / department background, course or programme focus, admissions criteria, interview style, academic values, likely subject-area questions, intellectual curiosity expectations, and scholarship/fellowship priorities.",
  media:
    "Focus on: podcast / show / broadcaster format, host style, audience profile, recurring themes, interview rhythm, likely challenge areas, public-facing message risks, and quotable answer opportunities.",
};

function normaliseTrack(value: unknown): Track {
  if (value === "academic" || value === "graduate" || value === "media") return value;
  // Back-compat for legacy IDs.
  if (value === "scholar") return "academic";
  if (value === "grad") return "graduate";
  return "professional";
}

function clip(s: string | null | undefined, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

async function firecrawlSearch(query: string, limit = 4): Promise<Array<{ url: string; title?: string; description?: string; markdown?: string }>> {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        limit,
        scrapeOptions: { formats: ["markdown"] },
      }),
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    const results = (data?.data ?? data?.web ?? []) as any[];
    return results.map((r) => ({
      url: r.url,
      title: r.title,
      description: r.description,
      markdown: typeof r.markdown === "string" ? r.markdown.slice(0, 4000) : undefined,
    })).filter((r) => r.url);
  } catch (_e) {
    return [];
  }
}

async function firecrawlScrape(url: string): Promise<string | null> {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const md = data?.markdown ?? data?.data?.markdown;
    return typeof md === "string" ? md.slice(0, 6000) : null;
  } catch (_e) {
    return null;
  }
}

const RESEARCH_SCHEMA = {
  type: "object",
  properties: {
    organisation_name: { type: "string" },
    organisation_type: {
      type: "string",
      enum: [
        "company", "university", "school", "graduate_employer",
        "media_platform", "podcast", "broadcaster", "other",
      ],
    },
    website: { type: "string" },
    summary: { type: "string", description: "2-4 sentence British-English summary." },
    mission_values: { type: "array", items: { type: "string" } },
    recent_news: { type: "array", items: { type: "string" } },
    products_services_programmes: { type: "array", items: { type: "string" } },
    leadership_or_faculty: { type: "array", items: { type: "string" } },
    culture_signals: { type: "array", items: { type: "string" } },
    preferred_interview_style: { type: "string" },
    known_interview_methods: { type: "array", items: { type: "string" } },
    likely_assessment_criteria: { type: "array", items: { type: "string" } },
    track_specific_notes: { type: "array", items: { type: "string" } },
  },
  required: ["organisation_name", "summary"],
  additionalProperties: false,
};

async function summariseWithAI(args: {
  track: Track;
  organisationName: string;
  jobSpecText: string;
  webSnippets: Array<{ url: string; title?: string; description?: string; markdown?: string }>;
  hasWeb: boolean;
}): Promise<{ ok: boolean; data?: any; error?: string }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return { ok: false, error: "LOVABLE_API_KEY missing" };

  const guidance = TRACK_RESEARCH_GUIDANCE[args.track];

  const sourcesBlock = args.webSnippets.length
    ? args.webSnippets.map((s, i) => `SOURCE ${i + 1} (${s.url}):
TITLE: ${s.title ?? ""}
DESCRIPTION: ${s.description ?? ""}
CONTENT:
${s.markdown ?? ""}`).join("\n\n---\n\n")
    : "(no live web sources available — use only the supplied brief)";

  const systemPrompt = `You are a UK-based interview research assistant for iPrpr by The Speech Coach. You write in British English (en-GB).

Your job: produce a strictly factual, structured research note about the organisation the candidate is preparing for. NEVER invent facts. If you do not have evidence, leave the field empty or omit it.

${guidance}

Rules:
- British English spelling and tone.
- Be concise. Bullet items should be short, scannable phrases.
- Only include items you can support from the supplied brief or sources.
- If web sources are absent, base the note solely on the supplied brief and keep it short — do not pad.
- Do not include marketing language, do not editorialise.`;

  const userPrompt = `TRACK: ${args.track}
ORGANISATION NAME (best guess): ${args.organisationName || "(unknown — infer from brief if possible)"}
WEB RESEARCH AVAILABLE: ${args.hasWeb ? "yes" : "no"}

SUPPLIED BRIEF / JOB SPEC / CONTEXT:
${args.jobSpecText || "(none)"}

WEB SOURCES:
${sourcesBlock}`;

  try {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_research",
            description: "Save the structured organisation research note.",
            parameters: RESEARCH_SCHEMA,
          },
        }],
        tool_choice: { type: "function", function: { name: "save_research" } },
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `AI gateway ${res.status}: ${txt.slice(0, 200)}` };
    }
    const data = await res.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = call?.function?.arguments;
    if (!argsStr) return { ok: false, error: "AI returned no structured payload" };
    const parsed = JSON.parse(argsStr);
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await userClient.auth.getClaims(token);
    if (authErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => null) as {
      prep_session_id?: string;
      track?: string;
      organisation_name?: string;
      job_spec_text?: string;
      job_spec_url?: string;
      role_title?: string;
    } | null;

    if (!body?.prep_session_id) {
      return new Response(JSON.stringify({ error: "prep_session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify ownership / workspace access via RLS-bound user client.
    const { data: session, error: sErr } = await userClient
      .from("prep_sessions")
      .select("id, user_id, workspace_id, interview_track, company_name, job_title, job_description, job_spec_url, target_role, target_industry")
      .eq("id", body.prep_session_id)
      .maybeSingle();
    if (sErr || !session) {
      return new Response(JSON.stringify({ error: "Session not found or access denied" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const track = normaliseTrack(body.track ?? (session as any).interview_track);
    const organisationName = (body.organisation_name || session.company_name || "").trim();
    const roleTitle = (body.role_title || session.job_title || session.target_role || "").trim();
    const jobSpecText = clip(body.job_spec_text || session.job_description || "", 8000);
    const jobSpecUrl = body.job_spec_url || session.job_spec_url || "";

    // Service-role client used only to write the research column (write is
    // safe because we already verified RLS access above with userClient).
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Try web research (Firecrawl) when available.
    const sources: string[] = [];
    let webSnippets: Array<{ url: string; title?: string; description?: string; markdown?: string }> = [];
    const hasFirecrawl = !!Deno.env.get("FIRECRAWL_API_KEY");

    if (hasFirecrawl && organisationName) {
      const trackQuery = (() => {
        switch (track) {
          case "academic": return `${organisationName} admissions interview process`;
          case "graduate": return `${organisationName} graduate scheme assessment centre interview`;
          case "media": return `${organisationName} podcast host interview style audience`;
          default: return `${organisationName} ${roleTitle} interview process culture values`;
        }
      })();
      webSnippets = await firecrawlSearch(trackQuery, 4);
      // Also try to scrape the job spec URL itself if provided.
      if (jobSpecUrl) {
        const scraped = await firecrawlScrape(jobSpecUrl);
        if (scraped) {
          webSnippets.push({ url: jobSpecUrl, title: "Job spec page", markdown: scraped });
        }
      }
      for (const s of webSnippets) sources.push(s.url);
    }

    const hasWeb = webSnippets.length > 0;

    // If we have nothing at all — no spec text and no web — record limited and exit.
    if (!jobSpecText && !hasWeb && !organisationName) {
      const payload = {
        organisation_name: "",
        organisation_type: "other",
        summary: "",
        status: "limited",
        note: "Not enough information was provided to research the organisation.",
        sources: [],
        last_researched_at: new Date().toISOString(),
      };
      await adminClient.from("prep_sessions")
        .update({ organisation_research: payload })
        .eq("id", session.id);
      return new Response(JSON.stringify({ ok: true, research: payload }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ai = await summariseWithAI({
      track,
      organisationName,
      jobSpecText,
      webSnippets,
      hasWeb,
    });

    let payload: any;
    if (!ai.ok || !ai.data) {
      payload = {
        organisation_name: organisationName,
        organisation_type: "other",
        summary: "",
        status: "failed",
        note: `Research could not be completed automatically${ai.error ? ` (${ai.error})` : ""}. We will use the information you provided.`,
        sources,
        last_researched_at: new Date().toISOString(),
      };
    } else {
      payload = {
        ...ai.data,
        website: ai.data.website || jobSpecUrl || "",
        sources,
        status: hasWeb ? "ok" : "limited",
        note: hasWeb
          ? null
          : "Research was based only on the information provided in the job spec.",
        last_researched_at: new Date().toISOString(),
      };
    }

    const { error: upErr } = await adminClient.from("prep_sessions")
      .update({ organisation_research: payload })
      .eq("id", session.id);
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit (best-effort).
    try {
      await adminClient.from("analytics_events").insert({
        user_id: userId,
        session_id: session.id,
        workspace_id: (session as any).workspace_id ?? null,
        event_name: "organisation_research_completed",
        metadata: { track, status: payload.status, source_count: sources.length },
      });
    } catch (_e) { /* non-fatal */ }

    return new Response(JSON.stringify({ ok: true, research: payload }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
