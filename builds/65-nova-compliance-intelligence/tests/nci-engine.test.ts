import { describe, expect, it } from 'vitest';
import { NciEngine, NciError } from '../src/nci-engine.js';

const T0 = '2026-11-01T00:00:00.000Z';
const ASOF = '2026-11-01';

function setup() {
  const e = new NciEngine('tenant-a', () => T0);
  e.registerSource('ana', { id: 'SRC-1', title: 'SAMPLE source (not real law)', jurisdiction: 'SAMPLE', effectiveDate: '2026-01-01', version: '1', contentHash: 'h1' });
  e.addRequirement('ana', { id: 'REQ-1', sourceId: 'SRC-1', citation: 'SAMPLE-1', text: 'Sample requirement', rail: 'medical-regulatory', severity: 'critical' });
  return e;
}

describe('NciEngine gap analysis', () => {
  it('fails closed: a requirement from an unapproved source is a gap', () => {
    const e = setup();
    expect(e.analyze(ASOF).map((g) => g.kind)).toEqual(['source-unapproved']);
  });

  it('walks the chain: no control, incomplete control, no evidence, unapproved evidence, then clear', () => {
    const e = setup();
    e.approveSource('maria', 'SRC-1');
    expect(e.analyze(ASOF)[0]?.kind).toBe('no-control');
    e.addControl('ana', { id: 'C-1', requirementIds: ['REQ-1'], ownerId: 'ana', title: 'Sample control', status: 'in-progress' });
    expect(e.analyze(ASOF)[0]?.kind).toBe('control-incomplete');
    e.updateControlStatus('ana', 'C-1', 'implemented');
    expect(e.analyze(ASOF)[0]?.kind).toBe('no-evidence');
    e.submitEvidence('ana', { id: 'EV-1', controlId: 'C-1', reference: 'policy.pdf', reviewDate: '2026-10-30' });
    expect(e.analyze(ASOF)[0]?.kind).toBe('unapproved-evidence');
    e.reviewEvidence('maria', 'EV-1', 'approved');
    expect(e.analyze(ASOF)).toEqual([]);
  });

  it('does not let the submitter approve their own evidence', () => {
    const e = setup();
    e.addControl('ana', { id: 'C-1', requirementIds: ['REQ-1'], ownerId: 'ana', title: 't', status: 'implemented' });
    e.submitEvidence('ana', { id: 'EV-1', controlId: 'C-1', reference: 'r', reviewDate: '2026-10-30' });
    expect(() => e.reviewEvidence('ana', 'EV-1', 'approved')).toThrow(NciError);
  });

  it('flags expired evidence', () => {
    const e = setup();
    e.approveSource('maria', 'SRC-1');
    e.addControl('ana', { id: 'C-1', requirementIds: ['REQ-1'], ownerId: 'ana', title: 't', status: 'implemented' });
    e.submitEvidence('ana', { id: 'EV-1', controlId: 'C-1', reference: 'r', reviewDate: '2026-01-01', expiresOn: '2026-06-30' });
    e.reviewEvidence('maria', 'EV-1', 'approved');
    expect(e.analyze(ASOF)[0]?.kind).toBe('expired-evidence');
    expect(e.analyze('2026-05-01')).toEqual([]);
  });
});

describe('source change detection', () => {
  it('flags affected requirements and controls, and withdraws earlier conclusions', () => {
    const e = setup();
    e.approveSource('maria', 'SRC-1');
    e.addControl('ana', { id: 'C-1', requirementIds: ['REQ-1'], ownerId: 'ana', title: 't', status: 'implemented' });
    e.submitEvidence('ana', { id: 'EV-1', controlId: 'C-1', reference: 'r', reviewDate: '2026-10-30' });
    e.reviewEvidence('maria', 'EV-1', 'approved');
    e.recordConclusion('maria', 'REQ-1', 'met', 'Evidence reviewed', ASOF);
    const result = e.recordSourceChange('system', 'SRC-1', { version: '2', effectiveDate: '2027-01-01', contentHash: 'h2' });
    expect(result).toEqual({ changed: true, affectedRequirementIds: ['REQ-1'], affectedControlIds: ['C-1'] });
    expect(e.analyze(ASOF)[0]?.kind).toBe('source-changed');
    expect(e.trace('REQ-1', ASOF).conclusion).toBeUndefined();
    e.approveSource('maria', 'SRC-1');
    expect(e.analyze(ASOF)).toEqual([]);
  });

  it('does nothing when the content hash is unchanged', () => {
    const e = setup();
    e.approveSource('maria', 'SRC-1');
    expect(e.recordSourceChange('system', 'SRC-1', { version: '1', effectiveDate: '2026-01-01', contentHash: 'h1' }).changed).toBe(false);
    expect(e.analyze(ASOF)[0]?.kind).toBe('no-control');
  });
});

describe('human approval gates', () => {
  it('blocks "met" while gaps are open and requires a named person and a note', () => {
    const e = setup();
    e.approveSource('maria', 'SRC-1');
    expect(() => e.recordConclusion('maria', 'REQ-1', 'met', 'looks fine', ASOF)).toThrow(/gaps are open/);
    expect(() => e.recordConclusion('nci-engine', 'REQ-1', 'not-met', 'x', ASOF)).toThrow(/named person/);
    expect(() => e.recordConclusion('maria', 'REQ-1', 'not-met', ' ', ASOF)).toThrow(/note/);
    expect(e.recordConclusion('maria', 'REQ-1', 'accepted-risk', 'Owner accepts until Q1', ASOF).decision).toBe('accepted-risk');
  });

  it('proposes draft actions and will not close them without human approval', () => {
    const e = setup();
    e.approveSource('maria', 'SRC-1');
    const [action] = e.proposeCorrectiveActions(ASOF);
    expect(action?.status).toBe('proposed');
    expect(action?.plan).toMatch(/DRAFT for human review/);
    expect(() => e.closeCorrectiveAction('ana', action!.id)).toThrow(/approved by a person/);
    e.approveCorrectiveAction('maria', action!.id, 'ana');
    expect(e.closeCorrectiveAction('ana', action!.id).status).toBe('closed');
    expect(e.proposeCorrectiveActions(ASOF)).toEqual([]); // no duplicates
  });
});

describe('trace and audit', () => {
  it('returns the whole chain for a requirement, with the disclaimer', () => {
    const e = setup();
    e.approveSource('maria', 'SRC-1');
    const t = e.trace('REQ-1', ASOF);
    expect(t.source?.id).toBe('SRC-1');
    expect(t.gaps).toHaveLength(1);
    expect(t.disclaimer).toMatch(/does not certify/);
  });

  it('keeps a hash-chained audit trail and detects tampering', () => {
    const e = setup();
    e.approveSource('maria', 'SRC-1');
    expect(e.verifyAuditChain()).toEqual({ ok: true });
    const copy = e.getAudit().map((x) => ({ ...x }));
    copy[1]!.detail = 'edited';
    expect(e.verifyAuditChain(copy)).toEqual({ ok: false, brokenAt: 2 });
  });
});
