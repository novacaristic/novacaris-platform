import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { PgStore, PgTenantRegistry } from '../src/pg-store.js';
import { readFileSync } from 'node:fs';

// Runs only when NCI_PG_ADMIN_URL points at a THROWAWAY PostgreSQL. Never point it at real data.
const ADMIN = process.env.NCI_PG_ADMIN_URL;
const APP = process.env.NCI_PG_APP_URL;
const d = ADMIN && APP ? describe : describe.skip;

const clock = () => '2026-11-01T00:00:00.000Z';
const src = { id: 'S1', title: 'SAMPLE', jurisdiction: 'SAMPLE', effectiveDate: '2026-01-01', version: '1', contentHash: 'h' };

d('PgStore (real PostgreSQL, row-level security)', () => {
  let admin: pg.Pool, app: pg.Pool, reg: PgTenantRegistry;
  const a = { userId: 'ana', tenantIds: ['tenant-a'] };
  const b = { userId: 'ben', tenantIds: ['tenant-b'] };

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN });
    await admin.query('DROP TABLE IF EXISTS nci_audit, nci_snapshot');
    await admin.query(readFileSync(new URL('../sql/001_nci_schema.sql', import.meta.url), 'utf8'));
    app = new pg.Pool({ connectionString: APP });
    reg = new PgTenantRegistry(new PgStore(app), clock);
  });
  afterAll(async () => { await app?.end(); await admin?.end(); });

  it('saves and reloads a tenant, audit chain intact', async () => {
    await reg.withTenant(a, 'tenant-a', (e) => { e.registerSource('ana', src); e.approveSource('maria', 'S1'); });
    const ok = await reg.withTenant(a, 'tenant-a', (e) => e.verifyAuditChain(e.getAudit()).ok);
    expect(ok).toBe(true);
    const rows = await admin.query("SELECT count(*)::int n FROM nci_audit WHERE tenant_id='tenant-a'");
    expect(rows.rows[0].n).toBe(2);
  });

  it('refuses a person who is not a member', async () => {
    await expect(reg.withTenant(b, 'tenant-a', () => 1)).rejects.toThrow(/not permitted/);
  });

  it('database itself hides other tenants even if the app code is bypassed', async () => {
    await reg.withTenant(b, 'tenant-b', (e) => e.registerSource('ben', { ...src, id: 'SB' }));
    const c = await app.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.tenant_id','tenant-b',true)");
      const snaps = await c.query('SELECT tenant_id FROM nci_snapshot');
      const aud = await c.query('SELECT DISTINCT tenant_id FROM nci_audit');
      expect(snaps.rows.map((r) => r.tenant_id)).toEqual(['tenant-b']);
      expect(aud.rows.map((r) => r.tenant_id)).toEqual(['tenant-b']);
      await expect(c.query("INSERT INTO nci_snapshot (tenant_id, snapshot) VALUES ('tenant-a','{}')")).rejects.toThrow(/row-level security/);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('with no tenant set, the app role sees nothing', async () => {
    const r = await app.query('SELECT count(*)::int n FROM nci_snapshot');
    expect(r.rows[0].n).toBe(0);
  });

  it('audit rows cannot be changed or deleted by the app role', async () => {
    const c = await app.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.tenant_id','tenant-a',true)");
      await expect(c.query("UPDATE nci_audit SET actor='x' WHERE tenant_id='tenant-a'")).rejects.toThrow(/permission denied/);
      await c.query('ROLLBACK');
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.tenant_id','tenant-a',true)");
      await expect(c.query("DELETE FROM nci_audit WHERE tenant_id='tenant-a'")).rejects.toThrow(/permission denied/);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('rolls back everything if the work fails', async () => {
    await expect(reg.withTenant(a, 'tenant-a', (e) => { e.addRequirement('ana', { id: 'R9', sourceId: 'S1', citation: 'x', text: 'x', rail: 'financial', severity: 'low' }); throw new Error('boom'); })).rejects.toThrow('boom');
    const has = await reg.withTenant(a, 'tenant-a', (e) => e.toSnapshot().requirements.some((r) => r.id === 'R9'));
    expect(has).toBe(false);
  });

  it('concurrent updates to one tenant do not lose each other', async () => {
    await Promise.all([1, 2, 3, 4, 5].map((i) => reg.withTenant(a, 'tenant-a', (e) => e.addRequirement('ana', { id: `C${i}`, sourceId: 'S1', citation: 'x', text: 'x', rail: 'financial', severity: 'low' }))));
    const ids = await reg.withTenant(a, 'tenant-a', (e) => e.toSnapshot().requirements.map((r) => r.id).sort());
    expect(ids).toEqual(['C1', 'C2', 'C3', 'C4', 'C5']);
    expect(await reg.withTenant(a, 'tenant-a', (e) => e.verifyAuditChain(e.getAudit()).ok)).toBe(true);
  });
});
