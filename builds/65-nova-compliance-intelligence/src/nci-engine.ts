// NovaCarïs Compliance Intelligence (NCI) — Intelligence Engine v1.0 (core logic)
//
// Traceability chain:
//   Regulation → Requirement → Control → Evidence → Gap → Corrective action → Human approval → Audit trail
//
// Scope: deterministic engine only. No AI interpretation, no live regulatory feeds, no UI, no database.
// This engine helps operators organize and monitor compliance. It does not certify legal compliance
// and does not replace legal, clinical, pharmacy or regulatory review.
import { createHash } from 'node:crypto';

export const NCI_DISCLAIMER =
  'NCI helps organize and monitor compliance work. It does not certify that a business is legally compliant, authorize prescribing, or replace qualified legal, clinical, pharmacy or regulatory review.';

export type Rail = 'medical-regulatory' | 'financial' | 'acquisition-retention';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type SourceStatus = 'draft' | 'approved' | 'changed-pending-review';

export interface RegulatorySource {
  id: string;
  tenantId: string;
  title: string;
  jurisdiction: string;
  effectiveDate: string; // ISO date
  version: string;
  contentHash: string;
  status: SourceStatus;
  approvedBy?: string;
}

export interface Requirement {
  id: string;
  sourceId: string;
  citation: string;
  text: string;
  rail: Rail;
  severity: Severity;
}

export interface Control {
  id: string;
  requirementIds: string[];
  ownerId: string;
  title: string;
  status: 'not-started' | 'in-progress' | 'implemented';
}

export interface Evidence {
  id: string;
  controlId: string;
  reference: string;
  submittedBy: string;
  reviewDate: string;
  expiresOn?: string;
  status: 'submitted' | 'approved' | 'rejected';
  approvedBy?: string;
}

export type GapKind =
  | 'source-unapproved'
  | 'source-changed'
  | 'no-control'
  | 'control-incomplete'
  | 'no-evidence'
  | 'unapproved-evidence'
  | 'expired-evidence';

export interface Gap {
  requirementId: string;
  kind: GapKind;
  severity: Severity;
  explanation: string;
  basis: string[]; // ids of the records the finding rests on
}

export interface CorrectiveAction {
  id: string;
  requirementId: string;
  gapKind: GapKind;
  plan: string;
  proposedBy: 'nci-engine';
  ownerId?: string;
  status: 'proposed' | 'approved' | 'closed';
  approvedBy?: string;
}

export interface Conclusion {
  requirementId: string;
  decision: 'met' | 'not-met' | 'accepted-risk';
  approverId: string;
  note: string;
  at: string;
}

export interface Proposal {
  id: string;
  sourceId: string;
  citation: string;
  quote: string; // verbatim text from the source that supports the proposal
  requirementText: string;
  rail: Rail;
  severity: Severity;
  generatedBy: string; // for example "ai:model-name" or "import"
  status: 'pending' | 'accepted' | 'rejected';
  decidedBy?: string;
}

export interface NciSnapshot {
  version: 1;
  tenantId: string;
  sources: RegulatorySource[];
  requirements: Requirement[];
  controls: Control[];
  evidence: Evidence[];
  actions: CorrectiveAction[];
  conclusions: Conclusion[];
  proposals: Proposal[];
  audit: AuditEvent[];
}

export interface AuditEvent {
  seq: number;
  at: string;
  actor: string;
  action: string;
  subject: string;
  detail: string;
  prevHash: string;
  hash: string;
}

const SEVERITY_ORDER: Severity[] = ['low', 'medium', 'high', 'critical'];
const GENESIS = 'GENESIS';

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export class NciError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NciError';
  }
}

export class NciEngine {
  readonly tenantId: string;
  private readonly sources = new Map<string, RegulatorySource>();
  private readonly requirements = new Map<string, Requirement>();
  private readonly controls = new Map<string, Control>();
  private readonly evidence = new Map<string, Evidence>();
  private readonly actions = new Map<string, CorrectiveAction>();
  private readonly conclusions = new Map<string, Conclusion>();
  private readonly proposals = new Map<string, Proposal>();
  private readonly audit: AuditEvent[] = [];
  private readonly clock: () => string;

  constructor(tenantId: string, clock: () => string = () => new Date().toISOString()) {
    if (!tenantId) throw new NciError('tenantId is required');
    this.tenantId = tenantId;
    this.clock = clock;
  }

  // ---------- sources ----------
  registerSource(actor: string, input: Omit<RegulatorySource, 'tenantId' | 'status' | 'approvedBy'>): RegulatorySource {
    if (this.sources.has(input.id)) throw new NciError(`source ${input.id} already exists`);
    const source: RegulatorySource = { ...input, tenantId: this.tenantId, status: 'draft' };
    this.sources.set(source.id, source);
    this.log(actor, 'source.registered', source.id, `${source.title} (${source.jurisdiction}) v${source.version}`);
    return source;
  }

  approveSource(approverId: string, sourceId: string): RegulatorySource {
    const source = this.mustGetSource(sourceId);
    source.status = 'approved';
    source.approvedBy = approverId;
    this.log(approverId, 'source.approved', sourceId, `version ${source.version}`);
    return source;
  }

  /** Records a change to an approved source. The source fails closed until a person re-approves it. */
  recordSourceChange(actor: string, sourceId: string, change: { version: string; effectiveDate: string; contentHash: string }) {
    const source = this.mustGetSource(sourceId);
    if (change.contentHash === source.contentHash) {
      this.log(actor, 'source.checked', sourceId, 'no change detected');
      return { changed: false, affectedRequirementIds: [] as string[], affectedControlIds: [] as string[] };
    }
    source.version = change.version;
    source.effectiveDate = change.effectiveDate;
    source.contentHash = change.contentHash;
    source.status = 'changed-pending-review';
    delete source.approvedBy;
    const affectedRequirementIds = [...this.requirements.values()].filter((r) => r.sourceId === sourceId).map((r) => r.id);
    const affectedControlIds = [...this.controls.values()]
      .filter((c) => c.requirementIds.some((id) => affectedRequirementIds.includes(id)))
      .map((c) => c.id);
    // earlier conclusions rested on the old text, so they no longer stand
    for (const id of affectedRequirementIds) this.conclusions.delete(id);
    this.log(actor, 'source.changed', sourceId, `now v${change.version}; ${affectedRequirementIds.length} requirements and ${affectedControlIds.length} controls flagged`);
    return { changed: true, affectedRequirementIds, affectedControlIds };
  }

  // ---------- requirements, controls, evidence ----------
  addRequirement(actor: string, req: Requirement): Requirement {
    this.mustGetSource(req.sourceId);
    if (this.requirements.has(req.id)) throw new NciError(`requirement ${req.id} already exists`);
    this.requirements.set(req.id, req);
    this.log(actor, 'requirement.added', req.id, `${req.citation} [${req.rail}, ${req.severity}]`);
    return req;
  }

  addControl(actor: string, control: Control): Control {
    for (const id of control.requirementIds) {
      if (!this.requirements.has(id)) throw new NciError(`unknown requirement ${id}`);
    }
    if (!control.ownerId) throw new NciError('a control needs an owner');
    this.controls.set(control.id, control);
    this.log(actor, 'control.added', control.id, `${control.title} -> ${control.requirementIds.join(',')}`);
    return control;
  }

  updateControlStatus(actor: string, controlId: string, status: Control['status']): Control {
    const c = this.mustGetControl(controlId);
    c.status = status;
    this.log(actor, 'control.status', controlId, status);
    return c;
  }

  submitEvidence(actor: string, ev: Omit<Evidence, 'status' | 'approvedBy' | 'submittedBy'>): Evidence {
    this.mustGetControl(ev.controlId);
    const evidence: Evidence = { ...ev, submittedBy: actor, status: 'submitted' };
    this.evidence.set(evidence.id, evidence);
    this.log(actor, 'evidence.submitted', evidence.id, evidence.reference);
    return evidence;
  }

  reviewEvidence(reviewerId: string, evidenceId: string, decision: 'approved' | 'rejected'): Evidence {
    const ev = this.evidence.get(evidenceId);
    if (!ev) throw new NciError(`unknown evidence ${evidenceId}`);
    if (ev.submittedBy === reviewerId) throw new NciError('the person who submitted evidence cannot approve it');
    ev.status = decision;
    if (decision === 'approved') ev.approvedBy = reviewerId;
    else delete ev.approvedBy;
    this.log(reviewerId, `evidence.${decision}`, evidenceId, ev.reference);
    return ev;
  }

  // ---------- gap analysis ----------
  /** Returns every open gap as of a date. Unknown or conflicting states fail closed (they produce a gap). */
  analyze(asOf: string): Gap[] {
    const gaps: Gap[] = [];
    for (const req of this.requirements.values()) {
      const source = this.sources.get(req.sourceId);
      if (!source || source.status === 'draft') {
        gaps.push({ requirementId: req.id, kind: 'source-unapproved', severity: req.severity, explanation: 'The regulatory source has not been approved by a person, so this requirement cannot be relied on.', basis: [req.sourceId] });
        continue;
      }
      if (source.status === 'changed-pending-review') {
        gaps.push({ requirementId: req.id, kind: 'source-changed', severity: req.severity, explanation: `The source changed (now version ${source.version}) and needs human re-approval before this requirement can be relied on.`, basis: [req.sourceId] });
        continue;
      }
      const controls = [...this.controls.values()].filter((c) => c.requirementIds.includes(req.id));
      if (controls.length === 0) {
        gaps.push({ requirementId: req.id, kind: 'no-control', severity: req.severity, explanation: 'No control is mapped to this requirement.', basis: [req.id] });
        continue;
      }
      const incomplete = controls.filter((c) => c.status !== 'implemented');
      if (incomplete.length === controls.length) {
        gaps.push({ requirementId: req.id, kind: 'control-incomplete', severity: req.severity, explanation: 'Every mapped control is still in progress or not started.', basis: incomplete.map((c) => c.id) });
        continue;
      }
      const controlIds = new Set(controls.map((c) => c.id));
      const evs = [...this.evidence.values()].filter((e) => controlIds.has(e.controlId));
      if (evs.length === 0) {
        gaps.push({ requirementId: req.id, kind: 'no-evidence', severity: req.severity, explanation: 'No evidence has been submitted for the mapped controls.', basis: [...controlIds] });
        continue;
      }
      const approved = evs.filter((e) => e.status === 'approved');
      if (approved.length === 0) {
        gaps.push({ requirementId: req.id, kind: 'unapproved-evidence', severity: req.severity, explanation: 'Evidence exists but none is approved by a second person.', basis: evs.map((e) => e.id) });
        continue;
      }
      const current = approved.filter((e) => !e.expiresOn || e.expiresOn >= asOf);
      if (current.length === 0) {
        gaps.push({ requirementId: req.id, kind: 'expired-evidence', severity: req.severity, explanation: 'All approved evidence has expired.', basis: approved.map((e) => e.id) });
      }
    }
    return gaps.sort((a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity));
  }

  // ---------- corrective actions ----------
  /** Creates draft corrective actions for gaps that have none yet. Drafts are plans for human review, never final. */
  proposeCorrectiveActions(asOf: string): CorrectiveAction[] {
    const created: CorrectiveAction[] = [];
    for (const gap of this.analyze(asOf)) {
      const id = `CA-${gap.requirementId}-${gap.kind}`;
      if (this.actions.has(id)) continue;
      const action: CorrectiveAction = { id, requirementId: gap.requirementId, gapKind: gap.kind, plan: PLAN_TEMPLATES[gap.kind], proposedBy: 'nci-engine', status: 'proposed' };
      this.actions.set(id, action);
      this.log('nci-engine', 'action.proposed', id, gap.kind);
      created.push(action);
    }
    return created;
  }

  approveCorrectiveAction(approverId: string, actionId: string, ownerId: string): CorrectiveAction {
    const a = this.mustGetAction(actionId);
    if (!ownerId) throw new NciError('an approved action needs an owner');
    a.status = 'approved';
    a.approvedBy = approverId;
    a.ownerId = ownerId;
    this.log(approverId, 'action.approved', actionId, `owner ${ownerId}`);
    return a;
  }

  closeCorrectiveAction(actor: string, actionId: string): CorrectiveAction {
    const a = this.mustGetAction(actionId);
    if (a.status !== 'approved') throw new NciError('an action must be approved by a person before it can be closed');
    a.status = 'closed';
    this.log(actor, 'action.closed', actionId, '');
    return a;
  }

  // ---------- human conclusions ----------
  /** A requirement can only be recorded as "met" by a person, and only when no gap is open. */
  recordConclusion(approverId: string, requirementId: string, decision: Conclusion['decision'], note: string, asOf: string): Conclusion {
    if (!this.requirements.has(requirementId)) throw new NciError(`unknown requirement ${requirementId}`);
    if (!approverId || approverId === 'nci-engine') throw new NciError('a named person must record a conclusion');
    if (!note.trim()) throw new NciError('a conclusion needs a note');
    const open = this.analyze(asOf).filter((g) => g.requirementId === requirementId);
    if (decision === 'met' && open.length > 0) throw new NciError(`cannot record "met" while gaps are open (${open.map((g) => g.kind).join(', ')})`);
    const c: Conclusion = { requirementId, decision, approverId, note, at: this.clock() };
    this.conclusions.set(requirementId, c);
    this.log(approverId, 'conclusion.recorded', requirementId, `${decision}: ${note}`);
    return c;
  }

  // ---------- trace ----------
  trace(requirementId: string, asOf: string) {
    const requirement = this.requirements.get(requirementId);
    if (!requirement) throw new NciError(`unknown requirement ${requirementId}`);
    const controls = [...this.controls.values()].filter((c) => c.requirementIds.includes(requirementId));
    const controlIds = new Set(controls.map((c) => c.id));
    return {
      disclaimer: NCI_DISCLAIMER,
      source: this.sources.get(requirement.sourceId),
      requirement,
      controls,
      evidence: [...this.evidence.values()].filter((e) => controlIds.has(e.controlId)),
      gaps: this.analyze(asOf).filter((g) => g.requirementId === requirementId),
      actions: [...this.actions.values()].filter((a) => a.requirementId === requirementId),
      conclusion: this.conclusions.get(requirementId),
    };
  }

  // ---------- proposals (AI-assisted or imported drafts) ----------
  /** Proposals are drafts. They create nothing until a named person accepts them. */
  submitProposal(actor: string, p: Omit<Proposal, 'status' | 'decidedBy' | 'generatedBy'> & { generatedBy?: string }): Proposal {
    this.mustGetSource(p.sourceId);
    if (!p.quote.trim()) throw new NciError('a proposal must quote the source text it rests on');
    if (this.proposals.has(p.id)) throw new NciError(`proposal ${p.id} already exists`);
    const proposal: Proposal = { ...p, generatedBy: p.generatedBy ?? actor, status: 'pending' };
    this.proposals.set(proposal.id, proposal);
    this.log(actor, 'proposal.submitted', proposal.id, `${proposal.citation} (${proposal.generatedBy})`);
    return proposal;
  }

  decideProposal(approverId: string, proposalId: string, decision: 'accepted' | 'rejected'): Proposal {
    const p = this.proposals.get(proposalId);
    if (!p) throw new NciError(`unknown proposal ${proposalId}`);
    if (p.status !== 'pending') throw new NciError(`proposal ${proposalId} is already ${p.status}`);
    if (!approverId || approverId === 'nci-engine' || approverId.startsWith('ai:')) throw new NciError('a named person must decide a proposal');
    p.status = decision;
    p.decidedBy = approverId;
    if (decision === 'accepted') {
      this.addRequirement(approverId, { id: `REQ-${p.id}`, sourceId: p.sourceId, citation: p.citation, text: p.requirementText, rail: p.rail, severity: p.severity });
    }
    this.log(approverId, `proposal.${decision}`, proposalId, '');
    return p;
  }

  listProposals(status?: Proposal['status']): Proposal[] {
    return [...this.proposals.values()].filter((p) => !status || p.status === status);
  }

  // ---------- snapshot ----------
  toSnapshot(): NciSnapshot {
    const copy = <T,>(m: Map<string, T>): T[] => JSON.parse(JSON.stringify([...m.values()])) as T[];
    return {
      version: 1,
      tenantId: this.tenantId,
      sources: copy(this.sources),
      requirements: copy(this.requirements),
      controls: copy(this.controls),
      evidence: copy(this.evidence),
      actions: copy(this.actions),
      conclusions: copy(this.conclusions),
      proposals: copy(this.proposals),
      audit: JSON.parse(JSON.stringify(this.audit)) as AuditEvent[],
    };
  }

  /** Rebuilds an engine from a snapshot. Fails closed if the snapshot's audit chain is broken or it belongs to another tenant. */
  static fromSnapshot(expectedTenantId: string, s: NciSnapshot, clock?: () => string): NciEngine {
    if (s.version !== 1) throw new NciError('unsupported snapshot version');
    if (s.tenantId !== expectedTenantId) throw new NciError('snapshot belongs to a different tenant');
    const engine = new NciEngine(expectedTenantId, clock);
    if (!engine.verifyAuditChain(s.audit).ok) throw new NciError('snapshot audit chain is broken');
    for (const x of s.sources) engine.sources.set(x.id, x);
    for (const x of s.requirements) engine.requirements.set(x.id, x);
    for (const x of s.controls) engine.controls.set(x.id, x);
    for (const x of s.evidence) engine.evidence.set(x.id, x);
    for (const x of s.actions) engine.actions.set(x.id, x);
    for (const x of s.conclusions) engine.conclusions.set(x.requirementId, x);
    for (const x of s.proposals) engine.proposals.set(x.id, x);
    engine.audit.push(...s.audit);
    return engine;
  }

  // ---------- audit ----------
  getAudit(): readonly AuditEvent[] {
    return this.audit;
  }

  verifyAuditChain(events: readonly AuditEvent[] = this.audit): { ok: boolean; brokenAt?: number } {
    let prev = GENESIS;
    for (const e of events) {
      if (e.prevHash !== prev || e.hash !== NciEngine.hashEvent(e)) return { ok: false, brokenAt: e.seq };
      prev = e.hash;
    }
    return { ok: true };
  }

  private static hashEvent(e: Omit<AuditEvent, 'hash'> | AuditEvent): string {
    return sha256([e.seq, e.at, e.actor, e.action, e.subject, e.detail, e.prevHash].join('|'));
  }

  private log(actor: string, action: string, subject: string, detail: string) {
    const prevHash = this.audit.at(-1)?.hash ?? GENESIS;
    const base = { seq: this.audit.length + 1, at: this.clock(), actor, action, subject, detail, prevHash };
    this.audit.push({ ...base, hash: NciEngine.hashEvent(base) });
  }

  private mustGetSource(id: string) {
    const s = this.sources.get(id);
    if (!s) throw new NciError(`unknown source ${id}`);
    return s;
  }
  private mustGetControl(id: string) {
    const c = this.controls.get(id);
    if (!c) throw new NciError(`unknown control ${id}`);
    return c;
  }
  private mustGetAction(id: string) {
    const a = this.actions.get(id);
    if (!a) throw new NciError(`unknown action ${id}`);
    return a;
  }
}

const PLAN_TEMPLATES: Record<GapKind, string> = {
  'source-unapproved': 'Have a named reviewer verify the source text, version, jurisdiction and effective date, then approve it. DRAFT for human review.',
  'source-changed': 'Have a named reviewer compare the changed source with the old version, update affected requirements and controls, then re-approve. DRAFT for human review.',
  'no-control': 'Assign an owner and define a control that addresses this requirement. DRAFT for human review.',
  'control-incomplete': 'Complete the mapped control and set its status to implemented once done. DRAFT for human review.',
  'no-evidence': 'Collect evidence showing the control operates (record, log, policy or sample) and submit it. DRAFT for human review.',
  'unapproved-evidence': 'Have a second person, who did not submit the evidence, review and approve or reject it. DRAFT for human review.',
  'expired-evidence': 'Collect fresh evidence and submit it for second-person approval. DRAFT for human review.',
};
