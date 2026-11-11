// NovaClerk fabrication guard.
// Checks an AI draft against the staff member's own source notes. Anything in
// the draft that the source does not support is flagged; invented facts,
// changed negations, altered quotes and invented risk events BLOCK signing
// until the author reviews them. This runs on every draft, whatever model
// produced it — it is the safety net for real LLM output.

export type ProvenanceClass = "SOURCE_FACT" | "TRANSFORMED" | "SUGGESTED";
export type FlagSeverity = "block" | "review";
export interface GuardFlag {
  code: "INVENTED_NUMBER" | "INVENTED_MEDICATION" | "ALTERED_QUOTE" | "NEGATION_CHANGED" | "INVENTED_RISK" | "HEDGE_REMOVED" | "UNSUPPORTED_STATEMENT";
  severity: FlagSeverity;
  field: string;
  sentence: string;
  detail: string;
}
export interface SentenceProvenance { field: string; sentence: string; class: ProvenanceClass; coverage: number; sourceSentence: string | null; }
export interface GuardResult { status: "clean" | "review_required" | "blocked"; flags: GuardFlag[]; provenance: SentenceProvenance[]; }

const STOP = new Set(("a an the and or of to in on at for with by from as is was were be been being it its this that these those he she they them his her their " +
  "resident client patient staff writer i we our you your has have had do did does will would can could should may might than then so but if into over under " +
  "about after before during also very just more most some any each per via").split(" "));
const NEGATIONS = /\b(no|not|never|denie[sd]|deny|without|refused|refuses|declined|negative for|none|n't)\b/i;
const HEDGES = /\b(may|might|possibly|possible|unclear|unsure|appeared to|seemed|reportedly|per (?:resident|staff)|unknown|uncertain|questionable|likely|unconfirmed)\b/i;
const RISK = /\b(suicid\w*|self[- ]harm\w*|homicid\w*|overdos\w*|restrain\w*|seclusion|elope\w*|assault\w*|weapon\w*|abus\w*|sexual\w*|intoxicat\w*|relaps\w*|hospitali[sz]\w*|911|police|AWOL)\b/gi;
const NUMBER = /\b\d{1,4}(?::\d{2})?(?:[.,]\d+)?(?:\s?(?:mg|mcg|g|ml|mL|units?|%|am|pm|bpm|mmHg|lbs?|kg))?\b/gi;
const QUOTE = /["“]([^"”]{2,})["”]/g;

/** Medication names the guard always recognizes, plus any passed per resident. */
export const COMMON_MEDS = [
  "hydroxyzine","lorazepam","clonazepam","alprazolam","diazepam","sertraline","fluoxetine","escitalopram","citalopram","paroxetine","bupropion","trazodone",
  "mirtazapine","venlafaxine","duloxetine","quetiapine","olanzapine","risperidone","aripiprazole","haloperidol","clozapine","ziprasidone","lurasidone","paliperidone",
  "lithium","lamotrigine","valproate","divalproex","carbamazepine","gabapentin","buprenorphine","suboxone","methadone","naltrexone","naloxone","narcan",
  "ibuprofen","acetaminophen","tylenol","naproxen","warfarin","metformin","insulin","lisinopril","amlodipine","atorvastatin","levothyroxine","prazosin",
  "propranolol","benztropine","cogentin","melatonin","nicotine","vivitrol","invega","abilify","seroquel","zyprexa","risperdal","ativan","klonopin","xanax",
];

export function splitSentences(text: string): string[] {
  return text.replace(/\r/g, "").split(/(?<=[.!?])\s+|\n+|;\s+|\s+-\s+(?=[A-Z])/).map(s => s.replace(/^[-•*\s]+/, "").trim()).filter(s => s.length > 1);
}
function words(s: string): string[] {
  return (s.toLowerCase().match(/[a-z][a-z'-]+|\d+(?::\d{2})?/g) ?? []).filter(w => !STOP.has(w));
}
function stem(w: string): string { return w.replace(/(ing|ed|es|s|ly)$/,""); }
function normNum(n: string): string { return n.toLowerCase().replace(/\s+/g, "").replace(",", ".").replace(/^0+(\d)/, "$1"); }
function nums(s: string): string[] { return (s.match(NUMBER) ?? []).map(normNum); }

function coverage(out: string, src: string): number {
  const o = words(out).map(stem); if (!o.length) return 1;
  const sset = new Set(words(src).map(stem));
  return o.filter(w => sset.has(w)).length / o.length;
}
function bestSource(out: string, sources: string[]): { s: string | null; c: number } {
  let best: { s: string | null; c: number } = { s: null, c: 0 };
  for (const s of sources) { const c = coverage(out, s); if (c > best.c) best = { s, c }; }
  return best;
}

export interface DraftFields { [field: string]: string | null | undefined; }

export function guardDraft(source: string, draft: DraftFields, opts: { medications?: string[] } = {}): GuardResult {
  const srcSentences = splitSentences(source);
  const srcLower = source.toLowerCase();
  const srcNums = new Set(nums(source));
  const meds = [...new Set([...COMMON_MEDS, ...(opts.medications ?? []).map(m => m.toLowerCase().split(/\s+/)[0])])];
  const srcRisk = new Set((source.match(RISK) ?? []).map(r => stem(r.toLowerCase())));
  const flags: GuardFlag[] = []; const provenance: SentenceProvenance[] = [];

  for (const [field, text] of Object.entries(draft)) {
    if (!text) continue;
    for (const sentence of splitSentences(text)) {
      const { s: match, c } = bestSource(sentence, srcSentences);
      const cls: ProvenanceClass = c >= 0.85 ? "SOURCE_FACT" : c >= 0.5 ? "TRANSFORMED" : "SUGGESTED";
      provenance.push({ field, sentence, class: cls, coverage: Math.round(c * 100) / 100, sourceSentence: match });

      for (const n of nums(sentence)) {
        if (!srcNums.has(n) && !srcNums.has(n.replace(/[a-z%]+$/i, ""))) {
          flags.push({ code: "INVENTED_NUMBER", severity: "block", field, sentence, detail: `"${n}" does not appear in the source notes` });
        }
      }
      for (const m of meds) {
        if (new RegExp(`\\b${m}\\b`, "i").test(sentence) && !new RegExp(`\\b${m}\\b`, "i").test(srcLower)) {
          flags.push({ code: "INVENTED_MEDICATION", severity: "block", field, sentence, detail: `"${m}" is not in the source notes` });
        }
      }
      for (const q of sentence.matchAll(QUOTE)) {
        if (!srcLower.includes(q[1].toLowerCase().trim())) {
          flags.push({ code: "ALTERED_QUOTE", severity: "block", field, sentence, detail: `quoted words "${q[1]}" are not the resident's exact words in the source` });
        }
      }
      for (const r of sentence.match(RISK) ?? []) {
        if (!srcRisk.has(stem(r.toLowerCase()))) {
          flags.push({ code: "INVENTED_RISK", severity: "block", field, sentence, detail: `"${r}" is a risk event not mentioned in the source` });
        }
      }
      if (match && c >= 0.5) {
        const negOut = NEGATIONS.test(sentence), negSrc = NEGATIONS.test(match);
        if (negOut !== negSrc) {
          flags.push({ code: "NEGATION_CHANGED", severity: "block", field, sentence, detail: negSrc ? `the source says "${match}" (a negative) but the draft drops it` : `the draft adds a negative that is not in "${match}"` });
        }
        if (HEDGES.test(match) && !HEDGES.test(sentence)) {
          flags.push({ code: "HEDGE_REMOVED", severity: "block", field, sentence, detail: `the source is uncertain ("${match}") but the draft states it as fact` });
        }
      }
      if (cls === "SUGGESTED") {
        flags.push({ code: "UNSUPPORTED_STATEMENT", severity: "review", field, sentence, detail: "this sentence is not clearly supported by the source notes; confirm or remove it" });
      }
    }
  }
  const status = flags.some(f => f.severity === "block") ? "blocked" : flags.length ? "review_required" : "clean";
  return { status, flags, provenance };
}
