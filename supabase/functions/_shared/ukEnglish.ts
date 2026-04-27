// UK English post-processing layer.
// Replaces common US spellings with UK equivalents in AI-generated text.
// Used as a safety net in case the model slips despite the system prompt.
//
// Rules:
//   - Word-boundary replacements only (no substring munging inside other words).
//   - Preserve original casing (lower / Title / UPPER) of the matched token.
//   - Skip code/URLs/emails so we don't rewrite identifiers like `color` in CSS.
//
// Keep this list curated — only high-confidence, unambiguous swaps.
// Ambiguous pairs (e.g. "practice" noun vs "practise" verb) are NOT auto-fixed
// here; the system prompt instructs the model to handle them in context.

type Replacement = readonly [RegExp, string];

// Lowercase pairs. We build case-aware regexes from these at module load.
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  // -ize / -ization → -ise / -isation
  ["organize", "organise"],
  ["organized", "organised"],
  ["organizing", "organising"],
  ["organization", "organisation"],
  ["organizations", "organisations"],
  ["organizational", "organisational"],
  ["realize", "realise"],
  ["realized", "realised"],
  ["realizing", "realising"],
  ["realization", "realisation"],
  ["recognize", "recognise"],
  ["recognized", "recognised"],
  ["recognizing", "recognising"],
  ["recognition", "recognition"], // identical, kept for clarity (no-op)
  ["optimize", "optimise"],
  ["optimized", "optimised"],
  ["optimizing", "optimising"],
  ["optimization", "optimisation"],
  ["prioritize", "prioritise"],
  ["prioritized", "prioritised"],
  ["prioritizing", "prioritising"],
  ["prioritization", "prioritisation"],
  ["analyze", "analyse"],
  ["analyzed", "analysed"],
  ["analyzing", "analysing"],
  ["minimize", "minimise"],
  ["minimized", "minimised"],
  ["minimizing", "minimising"],
  ["maximize", "maximise"],
  ["maximized", "maximised"],
  ["maximizing", "maximising"],
  ["customize", "customise"],
  ["customized", "customised"],
  ["customizing", "customising"],
  ["customization", "customisation"],
  ["summarize", "summarise"],
  ["summarized", "summarised"],
  ["summarizing", "summarising"],
  ["emphasize", "emphasise"],
  ["emphasized", "emphasised"],
  ["emphasizing", "emphasising"],
  ["specialize", "specialise"],
  ["specialized", "specialised"],
  ["specializing", "specialising"],
  ["specialization", "specialisation"],
  ["utilize", "utilise"],
  ["utilized", "utilised"],
  ["utilizing", "utilising"],
  ["finalize", "finalise"],
  ["finalized", "finalised"],
  ["finalizing", "finalising"],
  ["categorize", "categorise"],
  ["categorized", "categorised"],
  ["categorizing", "categorising"],
  ["memorize", "memorise"],
  ["memorized", "memorised"],
  ["memorizing", "memorising"],
  ["standardize", "standardise"],
  ["standardized", "standardised"],
  ["standardizing", "standardising"],
  ["modernize", "modernise"],
  ["modernized", "modernised"],
  ["apologize", "apologise"],
  ["apologized", "apologised"],
  ["apologizing", "apologising"],
  ["criticize", "criticise"],
  ["criticized", "criticised"],
  ["criticizing", "criticising"],
  ["jeopardize", "jeopardise"],
  ["jeopardized", "jeopardised"],

  // -or → -our
  ["color", "colour"],
  ["colors", "colours"],
  ["colored", "coloured"],
  ["coloring", "colouring"],
  ["behavior", "behaviour"],
  ["behaviors", "behaviours"],
  ["behavioral", "behavioural"],
  ["favor", "favour"],
  ["favors", "favours"],
  ["favored", "favoured"],
  ["favoring", "favouring"],
  ["favorite", "favourite"],
  ["favorites", "favourites"],
  ["honor", "honour"],
  ["honors", "honours"],
  ["honored", "honoured"],
  ["honoring", "honouring"],
  ["labor", "labour"],
  ["labors", "labours"],
  ["labored", "laboured"],
  ["neighbor", "neighbour"],
  ["neighbors", "neighbours"],
  ["humor", "humour"],
  ["humorous", "humorous"], // identical
  ["rumor", "rumour"],
  ["rumors", "rumours"],
  ["endeavor", "endeavour"],
  ["endeavors", "endeavours"],

  // -er → -re
  ["center", "centre"],
  ["centers", "centres"],
  ["centered", "centred"],
  ["centering", "centring"],
  ["theater", "theatre"],
  ["theaters", "theatres"],
  ["fiber", "fibre"],
  ["fibers", "fibres"],
  ["liter", "litre"],
  ["liters", "litres"],
  ["meter", "metre"], // unit; "meter" as device stays — low risk in this product
  ["meters", "metres"],

  // -se → -ce (specific safe nouns)
  ["defense", "defence"],
  ["defenses", "defences"],
  ["offense", "offence"],
  ["offenses", "offences"],
  ["license", "licence"], // noun; verb is "to license" in both — low risk in copy
  ["licenses", "licences"],

  // Doubled-l forms
  ["traveling", "travelling"],
  ["traveled", "travelled"],
  ["traveler", "traveller"],
  ["travelers", "travellers"],
  ["modeling", "modelling"],
  ["modeled", "modelled"],
  ["canceling", "cancelling"], // note: Stripe API status "canceled" is intentionally kept (handled by URL/code skip)
  ["counseling", "counselling"],
  ["counseled", "counselled"],
  ["counselor", "counsellor"],
  ["fueling", "fuelling"],
  ["fueled", "fuelled"],
  ["labeling", "labelling"],
  ["labeled", "labelled"],
  ["signaling", "signalling"],
  ["signaled", "signalled"],

  // Misc word-level
  ["program", "programme"], // schedule/plan sense; "program" as software left untouched is risky.
                              // We accept the trade-off here — interview copy uses "programme" for schedules.
  ["programs", "programmes"],
  ["catalog", "catalogue"],
  ["catalogs", "catalogues"],
  ["dialog", "dialogue"],
  ["dialogs", "dialogues"],
  ["draft", "draft"], // identical
  ["judgment", "judgement"],
  ["judgments", "judgements"],
  ["enrollment", "enrolment"],
  ["enrollments", "enrolments"],
  ["fulfill", "fulfil"],
  ["fulfills", "fulfils"],
  ["fulfillment", "fulfilment"],
  ["installment", "instalment"],
  ["installments", "instalments"],
  ["skillful", "skilful"],
  ["willful", "wilful"],
  ["mom", "mum"],
  ["moms", "mums"],
  ["gotten", "got"],
  ["math", "maths"],
  ["airplane", "aeroplane"],
  ["aluminum", "aluminium"],
  ["plow", "plough"],
  ["pajamas", "pyjamas"],
  ["gray", "grey"],

  // Phrases
  ["reach out to", "contact"],
  ["reach out", "get in touch"],
];

const REPLACEMENTS: Replacement[] = PAIRS
  .filter(([from, to]) => from !== to)
  .map(([from, to]) => {
    // Escape regex specials (none in our list, but defensive).
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Word-boundary, case-insensitive.
    return [new RegExp(`\\b${escaped}\\b`, "gi"), to] as const;
  });

function matchCase(source: string, target: string): string {
  if (source === source.toUpperCase() && source.length > 1) return target.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) {
    return target[0].toUpperCase() + target.slice(1);
  }
  return target;
}

// Rewrite a single plain-text segment (no code/URL/email content).
function rewriteSegment(segment: string): string {
  let out = segment;
  for (const [re, to] of REPLACEMENTS) {
    out = out.replace(re, (matched) => matchCase(matched, to));
  }
  return out;
}

// Skip URLs, emails, and inline/fenced code so we don't munge identifiers.
const SKIP_PATTERN =
  /(```[\s\S]*?```|`[^`\n]*`|\bhttps?:\/\/\S+|\b[\w.+-]+@[\w-]+\.[\w.-]+\b)/g;

/**
 * Convert a free-text string to UK English.
 * Preserves URLs, emails, and code spans/blocks.
 */
export function toUkEnglish(input: string): string {
  if (!input) return input;
  let result = "";
  let lastIndex = 0;
  for (const match of input.matchAll(SKIP_PATTERN)) {
    const start = match.index ?? 0;
    result += rewriteSegment(input.slice(lastIndex, start));
    result += match[0]; // keep skipped segment verbatim
    lastIndex = start + match[0].length;
  }
  result += rewriteSegment(input.slice(lastIndex));
  return result;
}

/**
 * Recursively walk a JSON-shaped value and rewrite every string leaf.
 * Object keys are NOT rewritten (they're contract, not copy).
 */
export function ukifyJson<T>(value: T): T {
  if (typeof value === "string") {
    return toUkEnglish(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => ukifyJson(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = ukifyJson(v);
    }
    return out as unknown as T;
  }
  return value;
}
