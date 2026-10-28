// AI-assisted drafting layer. The model is injected, so tests and offline use need no network call.
// Rules: the model only proposes. Every proposal must quote the source text it rests on, and a proposal whose
// quote is not found in the source is rejected here, before a person ever sees it. Nothing is accepted automatically.
import { NciEngine, type Proposal, type Rail, type Severity } from './nci-engine.js';

export interface DraftCandidate {
  citation: string;
  quote: string;
  requirementText: string;
  rail: Rail;
  severity: Severity;
}

export interface DraftingModel {
  readonly name: string;
  draft(sourceText: string): Promise<unknown>;
}

const RAILS: Rail[] = ['medical-regulatory', 'financial', 'acquisition-retention'];
const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

export function validateCandidates(raw: unknown, sourceText: string): { valid: DraftCandidate[]; rejected: { reason: string; item: unknown }[] } {
  const valid: DraftCandidate[] = [];
  const rejected: { reason: string; item: unknown }[] = [];
  if (!Array.isArray(raw)) return { valid, rejected: [{ reason: 'model output was not a list', item: raw }] };
  const haystack = norm(sourceText);
  for (const item of raw) {
    const c = item as Partial<DraftCandidate> | null;
    if (!c || typeof c !== 'object') { rejected.push({ reason: 'not an object', item }); continue; }
    if (![c.citation, c.quote, c.requirementText].every((v) => typeof v === 'string' && v.trim().length > 0)) { rejected.push({ reason: 'missing text field', item }); continue; }
    if (!RAILS.includes(c.rail as Rail)) { rejected.push({ reason: 'unknown rail', item }); continue; }
    if (!SEVERITIES.includes(c.severity as Severity)) { rejected.push({ reason: 'unknown severity', item }); continue; }
    if (!haystack.includes(norm(c.quote as string))) { rejected.push({ reason: 'quote not found in source text', item }); continue; }
    valid.push(c as DraftCandidate);
  }
  return { valid, rejected };
}

/** Asks the model for candidates, drops unsupported ones, and files the rest as pending proposals. */
export async function draftProposals(engine: NciEngine, model: DraftingModel, sourceId: string, sourceText: string) {
  const raw = await model.draft(sourceText);
  const { valid, rejected } = validateCandidates(raw, sourceText);
  const created: Proposal[] = [];
  valid.forEach((c, i) => {
    created.push(engine.submitProposal(`ai:${model.name}`, { id: `${sourceId}-P${i + 1}`, sourceId, ...c }));
  });
  return { created, rejected };
}
