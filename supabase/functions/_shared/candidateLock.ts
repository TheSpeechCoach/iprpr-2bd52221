// Shared helpers for enforcing one-candidate-per-account.
//
// - normaliseName: lowercase, strip punctuation, collapse whitespace, drop
//   common honorifics, so "Dr. Alex J. Morgan" ≈ "alex morgan".
// - namesLooselyMatch: tolerant comparison — exact, contains, or
//   first+last-name overlap.
// - cvMentionsName: heuristic check that a CV string plausibly belongs to
//   the locked candidate.

const HONORIFICS = new Set([
  "mr", "mrs", "ms", "miss", "mx", "dr", "prof", "sir", "dame",
]);

export function normaliseName(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter((tok) => tok && !HONORIFICS.has(tok.replace(/\.$/, "")))
    .join(" ")
    .trim();
}

function tokens(name: string): string[] {
  return normaliseName(name).split(/\s+/).filter(Boolean);
}

export function namesLooselyMatch(a: string, b: string): boolean {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = tokens(na);
  const tb = tokens(nb);
  if (ta.length < 2 || tb.length < 2) return false;
  // First + last must both appear (in either order) in the other.
  const aFirst = ta[0];
  const aLast = ta[ta.length - 1];
  const bFirst = tb[0];
  const bLast = tb[tb.length - 1];
  const setA = new Set(ta);
  const setB = new Set(tb);
  return (setB.has(aFirst) && setB.has(aLast)) || (setA.has(bFirst) && setA.has(bLast));
}

export function cvMentionsName(cvText: string | null | undefined, lockedName: string): boolean {
  if (!cvText || !lockedName) return false;
  // Look only at the first ~1500 chars — names always appear at the top of a CV.
  const head = cvText.slice(0, 1500);
  const normalisedCv = normaliseName(head);
  const ln = normaliseName(lockedName);
  if (!ln) return false;
  if (normalisedCv.includes(ln)) return true;
  // Fallback: first + last name both present anywhere in the CV head.
  const parts = ln.split(" ").filter(Boolean);
  if (parts.length < 2) return normalisedCv.includes(ln);
  const first = parts[0];
  const last = parts[parts.length - 1];
  return normalisedCv.includes(first) && normalisedCv.includes(last);
}
