// Extract text from a CV (PDF or DOCX) stored in the private `cvs` bucket.
// Authenticated only. Validates mime + size. Logs failures to admin_logs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { unzipSync, strFromU8 } from "https://esm.sh/fflate@0.8.2";
import {
  PRO_LIMITS,
  CV_DISTINCT_LIMITS,
  getProUsage,
  getUserPlan,
  hashCvContent,
  buildLimitBlock,
} from "../_shared/proLimits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXT = ["pdf", "docx"] as const;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function normaliseWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

function extractDocx(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("Invalid DOCX: missing word/document.xml");
  const docXml = strFromU8(xml);

  // Convert paragraph + line break markers to newlines, then strip tags.
  const withBreaks = docXml
    .replace(/<w:p[ >][^]*?<\/w:p>/g, (m) => m + "\n")
    .replace(/<w:br\s*\/?>/g, "\n")
    .replace(/<w:tab\s*\/?>/g, "\t");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  // Decode common XML entities
  return stripped
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let userId: string | null = null;
  let filePath: string | null = null;

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const bucket = (body.bucket ?? "cvs") as string;
    filePath = (body.file_path ?? "") as string;
    const sessionId = (body.session_id ?? null) as string | null;

    if (!filePath || typeof filePath !== "string") {
      return new Response(JSON.stringify({ error: "file_path is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Path must belong to the calling user: `<userId>/...`
    const firstSegment = filePath.split("/")[0];
    if (firstSegment !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXT.includes(ext as (typeof ALLOWED_EXT)[number])) {
      return new Response(JSON.stringify({ error: "Unsupported file type. Use PDF or DOCX." }), {
        status: 415,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download with the service-role admin client (bucket is private).
    const { data: blob, error: dErr } = await admin.storage.from(bucket).download(filePath);
    if (dErr || !blob) throw new Error(`Storage download failed: ${dErr?.message ?? "unknown"}`);

    const mime = blob.type || "";
    if (mime && !ALLOWED_MIME.has(mime)) {
      return new Response(JSON.stringify({ error: `Invalid mime type: ${mime}` }), {
        status: 415,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (blob.size > MAX_BYTES) {
      return new Response(
        JSON.stringify({ error: `File too large (${blob.size} bytes, max ${MAX_BYTES})` }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());

    let raw = "";
    let parseError: string | null = null;
    try {
      raw = ext === "pdf" ? await extractPdf(bytes) : extractDocx(bytes);
    } catch (parseErr: any) {
      parseError = `Parse failure (${ext}): ${parseErr?.message ?? parseErr}`;
    }

    const text = normaliseWhitespace(raw);
    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const extractionUsable = !!text && wordCount >= 20;

    // Hash from normalised extracted text where possible; fall back to raw bytes.
    const { hash: contentHash, source: hashSource } = await hashCvContent(
      extractionUsable ? text : null,
      bytes,
    );

    // ===== Distinct-CV cap (Pro: 3, Coach+: 8). Free handled elsewhere. =====
    const env = (req.headers.get("x-stripe-env") === "live") ? "live" : "sandbox";
    const userPlan = await getUserPlan(admin, userId, env);
    if (userPlan === "pro" || userPlan === "coach_plus") {
      const usage = await getProUsage(admin, userId);
      if (usage) {
        const planLimit = CV_DISTINCT_LIMITS[userPlan];
        const { data: existingHash } = await admin
          .from("uploaded_files")
          .select("id")
          .eq("user_id", userId)
          .eq("kind", "cv")
          .eq("cv_content_hash", contentHash)
          .gte("created_at", usage.period_start)
          .lt("created_at", usage.period_end)
          .limit(1)
          .maybeSingle();

        const isNewCv = !existingHash;
        if (isNewCv && usage.distinct_cvs >= planLimit) {
          const block = buildLimitBlock(
            "distinctCvsPerPeriod",
            usage.distinct_cvs,
            usage.period_end,
            planLimit,
          );
          return new Response(JSON.stringify(block), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    if (!extractionUsable) {
      throw new Error(parseError ?? "Extraction produced no usable text (scanned PDF?).");
    }

    console.log("cv_hash", { userId, hashSource, contentHash: contentHash.slice(0, 12) });

    // Persist to uploaded_files (best-effort). If a row exists for this path, update it.
    try {
      const { data: existing } = await admin
        .from("uploaded_files")
        .select("id")
        .eq("user_id", userId)
        .eq("file_path", filePath)
        .maybeSingle();

      if (existing?.id) {
        await admin
          .from("uploaded_files")
          .update({
            extracted_text: text,
            mime_type: mime || null,
            size_bytes: blob.size,
            cv_content_hash: contentHash,
          })
          .eq("id", existing.id);
      } else {
        await admin.from("uploaded_files").insert({
          user_id: userId,
          session_id: sessionId,
          kind: "cv",
          bucket,
          file_path: filePath,
          mime_type: mime || null,
          size_bytes: blob.size,
          extracted_text: text,
          cv_content_hash: contentHash,
        });
      }
    } catch (persistErr) {
      console.error("uploaded_files persist failed", persistErr);
    }

    // Mirror onto prep_sessions.cv_text if session_id provided.
    if (sessionId) {
      await admin
        .from("prep_sessions")
        .update({ cv_text: text, cv_file_path: filePath })
        .eq("id", sessionId)
        .eq("user_id", userId);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        text,
        metadata: {
          file_path: filePath,
          bucket,
          mime_type: mime || null,
          size_bytes: blob.size,
          word_count: wordCount,
          char_count: text.length,
          format: ext,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    const message = e?.message ?? String(e);
    console.error("extract-cv-text error", message);
    try {
      await admin.from("admin_logs").insert({
        event: "cv_extract_failed",
        metadata: { user_id: userId, file_path: filePath, error: message },
      });
    } catch (_) {
      // swallow
    }
    return new Response(
      JSON.stringify({ error: "Extraction failed", detail: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
