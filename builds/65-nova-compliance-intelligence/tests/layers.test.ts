import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NciEngine, NciError } from '../src/nci-engine.js';
import { FileStore, MemoryStore, TenantRegistry } from '../src/stores.js';
import { draftProposals, validateCandidates, type DraftingModel } from '../src/drafting.js';
import { renderReportHtml } from '../src/report.js';

const clock = () => '2026-11-01T00:00:00.000Z';
const SOURCE_TEXT = 'Section 1. A provider must verify each prescriber license before service. Section 2. Records must be kept for six years.';
const seed = (e: NciEngine) => e.registerSource('ana', { id: 'SRC-1', title: 'SAMPLE', jurisdiction: 'SAMPLE', effectiveDate: '2026-01-01', version: '1', contentHash: 'h1' });

describe('persistence and tenant isolation', () => {
  it('saves and reloads a tenant, keeping the audit chain intact', () => {
    const reg = new TenantRegistry(new MemoryStore(), clock);
    const ana = { userId: 'ana', tenantIds: ['tenant-a'] };
    reg.withTenant(ana, 'tenant-a', (e) => seed(e));
    const count = reg.withTenant(ana, 'tenant-a', (e) => { e.approveSource('maria', 'SRC-1'); return e.getAudit().length; });
    expect(count).toBe(2);
    expect(reg.withTenant(ana, 'tenant-a', (e) => e.verifyAuditChain().ok)).toBe(true);
  });

  it('refuses a person access to a tenant they do not belong to', () => {
    const reg = new TenantRegistry(new MemoryStore(), clock);
    expect(() => reg.withTenant({ userId: 'ana', tenantIds: ['tenant-a'] }, 'tenant-b', () => 1)).toThrow(/not permitted/);
  });

  it('keeps tenants separate and rejects a snapshot filed under the wrong tenant', () => {
    const store = new MemoryStore();
    const reg = new TenantRegistry(store, clock);
    const both = { userId: 'root', tenantIds: ['tenant-a', 'tenant-b'] };
    reg.withTenant(both, 'tenant-a', (e) => seed(e));
    expect(reg.withTenant(both, 'tenant-b', (e) => e.toSnapshot().sources.length)).toBe(0);
    const snapA = store.load('tenant-a')!;
    expect(() => NciEngine.fromSnapshot('tenant-b', snapA)).toThrow(/different tenant/);
    expect(() => store.save('tenant-b', snapA)).toThrow(NciError);
  });

  it('rejects unsafe tenant ids and tampered snapshots', () => {
    const store = new MemoryStore();
    expect(() => store.load('../etc/passwd')).toThrow(/invalid tenant id/);
    const e = new NciEngine('tenant-a', clock);
    seed(e);
    const snap = e.toSnapshot();
    snap.audit[0]!.detail = 'edited';
    expect(() => NciEngine.fromSnapshot('tenant-a', snap)).toThrow(/audit chain is broken/);
  });

  it('round-trips through files', () => {
    const store = new FileStore(mkdtempSync(join(tmpdir(), 'nci-')));
    const e = new NciEngine('tenant-a', clock);
    seed(e);
    store.save('tenant-a', e.toSnapshot());
    expect(NciEngine.fromSnapshot('tenant-a', store.load('tenant-a')!, clock).toSnapshot().sources).toHaveLength(1);
  });
});

describe('AI drafting layer', () => {
  const good = { citation: 'SAMPLE s1', quote: 'A provider must verify each prescriber license before service.', requirementText: 'Verify prescriber licenses before service', rail: 'medical-regulatory', severity: 'critical' };
  it('drops candidates whose quote is not in the source or whose fields are invalid', () => {
    const { valid, rejected } = validateCandidates([good, { ...good, quote: 'Invented sentence the source never contains.' }, { ...good, rail: 'astrology' }, 'junk'], SOURCE_TEXT);
    expect(valid).toHaveLength(1);
    expect(rejected.map((r) => r.reason)).toEqual(['quote not found in source text', 'unknown rail', 'not an object']);
  });

  it('files supported candidates as pending proposals that need a named person', async () => {
    const e = new NciEngine('tenant-a', clock);
    seed(e);
    const model: DraftingModel = { name: 'stub', draft: async () => [good] };
    const { created } = await draftProposals(e, model, 'SRC-1', SOURCE_TEXT);
    expect(created).toHaveLength(1);
    expect(created[0]?.status).toBe('pending');
    expect(created[0]?.generatedBy).toBe('ai:stub');
    expect(e.toSnapshot().requirements).toHaveLength(0); // nothing created yet
    expect(() => e.decideProposal('ai:stub', 'SRC-1-P1', 'accepted')).toThrow(/named person/);
    e.decideProposal('maria', 'SRC-1-P1', 'accepted');
    expect(e.toSnapshot().requirements[0]?.id).toBe('REQ-SRC-1-P1');
    expect(() => e.decideProposal('maria', 'SRC-1-P1', 'accepted')).toThrow(/already accepted/);
  });
});

describe('review report', () => {
  it('renders gaps, pending items and escapes content', () => {
    const e = new NciEngine('tenant-a', clock);
    seed(e);
    e.submitProposal('ai:stub', { id: 'P1', sourceId: 'SRC-1', citation: '<script>x</script>', quote: 'q', requirementText: 'Do "this"', rail: 'financial', severity: 'high' });
    e.decideProposal('maria', 'P1', 'accepted');
    const html = renderReportHtml(e.toSnapshot(), '2026-11-01');
    expect(html).toContain('Open gaps (1)');
    expect(html).toContain('does not certify');
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('intact');
  });
});
