// NovaClerk Documentation Agent (Phase 1 slice).
// Turns a staff member's rough notes / transcript into a DRAFT progress note.
// It never signs, never finalizes, never writes outside the draft. Every draft
// goes through the fabrication guard and the documentation coach, and the
// result (with provenance) is stored for the human reviewer.
import { guardDraft, splitSentences, type GuardResult } from "./guard";

export interface DraftRequest {
  source: string;                       // the staff member's own words
  noteType: string;
  residentFirstName?: string;
  goals?: { id: string; goal_number: number; goal: string }[];
  medications?: string[];
  serviceCode?: string | null;
}
export interface DraftContent {
  narrative: string;
  resident_response: string | null;
  plan_next_steps: string | null;
  treatment_plan_goal_ids: string[];
}
export interface CoachItem { field: string; message: string; }
export interface DraftResult {
  draft: DraftContent;
  guard: GuardResult;
  coach: CoachItem[];
  provider: string;
  model: string | null;
}
export interface DraftProvider { readonly name: string; readonly model: string | null; draft(req: DraftRequest): Promise<DraftContent>; }

export class AgentError extends Error { constructor(readonly code: string) { super(code); } }

// ------------------------------------------------------------------ coach
const RESPONSE_CUE = /\b(said|says|stated|states|reported|reports|replied|responded|shared|expressed|agreed|declined|refused|participated|engaged|completed|identified|demonstrated|appeared|was able|verbali[sz]ed|denied|denies|tolerated)\b/i;
const PLAN_CUE = /\b(plan|will|next|follow[- ]?up|continue|tomorrow|schedul\w*|refer\w*|monitor|revisit|practice|goal for)\b/i;
const INTERVENTION_CUE = /\b(provided|facilitated|coached|taught|reviewed|discussed|assisted|modeled|redirected|encouraged|prompted|educated|led|supported|met with|checked in|checked on|checked vitals|processed|role[- ]?played|helped|explored|weighed|administered)\b/i;
const RESIDENT_SUBJECT = /^(resident|client|he|she|they|his|her)\b/i;
const PLAN_START = /^(will|plan|continue|follow[- ]?up|next|revisit|schedule|recommend)/i;

export function coachDraft(req: DraftRequest, d: DraftContent): CoachItem[] {
  const items: CoachItem[] = [];
  if (!INTERVENTION_CUE.test(d.narrative)) items.push({ field: "narrative", message: "Describe the intervention you provided (what you did)." });
  if (!d.resident_response) items.push({ field: "resident_response", message: "Add how the resident responded or progressed. The notes don't say." });
  if (!d.plan_next_steps) items.push({ field: "plan_next_steps", message: "Add the plan or next step. The notes don't say." });
  if ((req.goals?.length ?? 0) > 0 && d.treatment_plan_goal_ids.length === 0) items.push({ field: "treatment_plan_goal_ids", message: "Link the treatment-plan goal this service addressed." });
  if (req.serviceCode && !/\b\d{1,3}\s?(min|minutes|hour|hours|hr)\b|\b\d{1,2}:\d{2}\b/i.test(req.source)) items.push({ field: "duration", message: "Billable service: record start and end times." });
  return items;
}

// ------------------------------------------------------------------ reference provider (deterministic, extractive)
/** Copies the staff member's own sentences into the right sections. It cannot invent anything. */
export class ReferenceProvider implements DraftProvider {
  readonly name = "reference-extractive"; readonly model = null;
  async draft(req: DraftRequest): Promise<DraftContent> {
    const tidy = (s: string) => { const t = s.trim().replace(/\s+/g, " "); const c = t.charAt(0).toUpperCase() + t.slice(1); return /[.!?]$/.test(c) ? c : c + "."; };
    const sentences = splitSentences(req.source).map(tidy);
    const first = (req.residentFirstName ?? "").trim();
    const isResident = (s: string) => RESIDENT_SUBJECT.test(s) || (first.length > 1 && s.toLowerCase().startsWith(first.toLowerCase()));
    const plan = sentences.filter(s => PLAN_START.test(s) || (PLAN_CUE.test(s) && /\bwill\b/i.test(s) && !isResident(s)));
    const response = sentences.filter(s => !plan.includes(s) && isResident(s) && RESPONSE_CUE.test(s));
    const narrative = sentences.filter(s => !plan.includes(s) && !response.includes(s));
    const text = req.source.toLowerCase();
    const goalIds = (req.goals ?? []).filter(g => new RegExp(`\\bgoal\\s*#?\\s*${g.goal_number}\\b`, "i").test(text)
      || g.goal.toLowerCase().split(/\W+/).filter(w => w.length > 5).some(w => text.includes(w))).map(g => g.id);
    return {
      narrative: (narrative.length ? narrative : sentences).join(" "),
      resident_response: response.length ? response.join(" ") : null,
      plan_next_steps: plan.length ? plan.join(" ") : null,
      treatment_plan_goal_ids: goalIds,
    };
  }
}

// ------------------------------------------------------------------ LLM provider (off unless a BAA is in place)
const SYSTEM_PROMPT = `You are NovaClerk, a documentation assistant for a behavioral health residential facility.
Rewrite the staff member's rough notes into a draft progress note with three sections.
Rules you must never break:
- Use ONLY facts in the staff notes. Never add numbers, times, doses, medications, diagnoses, risk events, or quotes that are not there.
- Keep every negative ("denied", "did not", "no") and every uncertainty ("may", "unclear", "appeared") exactly as uncertain as the notes.
- Put resident quotes in quotation marks only if the notes contain those exact words.
- If something is missing, leave that section empty rather than guessing.
- You draft only. A human reviews and signs.
Return JSON only: {"narrative": string, "resident_response": string|null, "plan_next_steps": string|null}`;

export interface LlmProviderOptions { apiKey: string; model: string; baaConfirmed: boolean; endpoint?: string; timeoutMs?: number; fetchImpl?: typeof fetch; }
/**
 * Anthropic Messages API provider. Refuses to construct unless the operator has
 * confirmed a signed HIPAA Business Associate Agreement covers this API use.
 */
export class AnthropicProvider implements DraftProvider {
  readonly name = "anthropic"; readonly model: string;
  constructor(private readonly o: LlmProviderOptions) {
    if (!o.baaConfirmed) throw new AgentError("AI_PROVIDER_BLOCKED_NO_BAA");
    if (!o.apiKey || !o.model) throw new AgentError("AI_PROVIDER_MISCONFIGURED");
    const url = new URL(o.endpoint ?? "https://api.anthropic.com/v1/messages");
    if (url.protocol !== "https:") throw new AgentError("AI_PROVIDER_INSECURE_ENDPOINT");
    this.model = o.model;
  }
  async draft(req: DraftRequest): Promise<DraftContent> {
    const f = this.o.fetchImpl ?? fetch;
    const res = await f(this.o.endpoint ?? "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.o.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: this.o.model, max_tokens: 1200, temperature: 0, system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Note type: ${req.noteType}\nStaff notes:\n<<<\n${req.source}\n>>>` }] }),
      signal: AbortSignal.timeout(this.o.timeoutMs ?? 30000),
    });
    if (!res.ok) throw new AgentError("AI_PROVIDER_ERROR_" + res.status);
    const body = await res.json() as { content?: { type: string; text?: string }[] };
    const text = (body.content ?? []).filter(b => b.type === "text").map(b => b.text ?? "").join("");
    return parseDraftJson(text);
  }
}

/** Strictly parse model output: only the three text fields are accepted, nothing else. */
export function parseDraftJson(text: string): DraftContent {
  const m = text.match(/\{[\s\S]*\}/); if (!m) throw new AgentError("AI_OUTPUT_NOT_JSON");
  let o: unknown; try { o = JSON.parse(m[0]); } catch { throw new AgentError("AI_OUTPUT_NOT_JSON"); }
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new AgentError("AI_OUTPUT_INVALID");
  const allowed = new Set(["narrative", "resident_response", "plan_next_steps"]);
  for (const k of Object.keys(o)) if (!allowed.has(k)) throw new AgentError("AI_OUTPUT_UNEXPECTED_FIELD:" + k);
  const r = o as Record<string, unknown>;
  const str = (v: unknown, max: number) => v === null || v === undefined || v === "" ? null : typeof v === "string" && v.length <= max ? v.trim() : (() => { throw new AgentError("AI_OUTPUT_INVALID"); })();
  const narrative = str(r.narrative, 20000); if (!narrative) throw new AgentError("AI_OUTPUT_EMPTY");
  return { narrative, resident_response: str(r.resident_response, 8000), plan_next_steps: str(r.plan_next_steps, 8000), treatment_plan_goal_ids: [] };
}

export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): DraftProvider {
  if (env.NOVA_AI_PROVIDER === "anthropic") {
    return new AnthropicProvider({ apiKey: env.NOVA_AI_API_KEY ?? "", model: env.NOVA_AI_MODEL ?? "", baaConfirmed: env.NOVA_AI_BAA_CONFIRMED === "true" });
  }
  return new ReferenceProvider();
}

// ------------------------------------------------------------------ agent
export class DocumentationAgent {
  constructor(private readonly provider: DraftProvider = new ReferenceProvider()) {}
  async run(req: DraftRequest): Promise<DraftResult> {
    if (!req.source || req.source.trim().length < 15) throw new AgentError("SOURCE_TOO_SHORT");
    if (req.source.length > 20000) throw new AgentError("SOURCE_TOO_LONG");
    const draft = await this.provider.draft(req);
    // goal links come only from the resident's own plan
    const valid = new Set((req.goals ?? []).map(g => g.id));
    draft.treatment_plan_goal_ids = draft.treatment_plan_goal_ids.filter(id => valid.has(id));
    const guard = guardDraft(req.source, { narrative: draft.narrative, resident_response: draft.resident_response, plan_next_steps: draft.plan_next_steps }, { medications: req.medications });
    return { draft, guard, coach: coachDraft(req, draft), provider: this.provider.name, model: this.provider.model };
  }
}
