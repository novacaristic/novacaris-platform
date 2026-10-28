import type { Pool, PoolClient } from 'pg';
import { NciEngine, NciError, type NciSnapshot } from './nci-engine.js';
import { assertTenantId, type Principal } from './stores.js';

/**
 * PostgreSQL storage. Connect as a role that is NOT the table owner and has no BYPASSRLS
 * (see sql/001_nci_schema.sql), so row-level security is what keeps tenants apart.
 */
export class PgStore {
  constructor(private readonly pool: Pool) {}

  /** Loads a tenant's snapshot, lets `mutate` change it, saves it, all in one locked transaction. */
  async update<T>(tenantId: string, mutate: (current: NciSnapshot | undefined) => { next: NciSnapshot; result: T }): Promise<T> {
    assertTenantId(tenantId);
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`nci:${tenantId}`]);
      const row = await client.query('SELECT snapshot FROM nci_snapshot WHERE tenant_id = $1', [tenantId]);
      const current = row.rows[0]?.snapshot as NciSnapshot | undefined;
      const { next, result } = mutate(current);
      if (next.tenantId !== tenantId) throw new NciError('snapshot tenant does not match');
      await client.query(
        `INSERT INTO nci_snapshot (tenant_id, snapshot, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (tenant_id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = now()`,
        [tenantId, JSON.stringify(next)],
      );
      const max = await client.query('SELECT COALESCE(MAX(seq), -1) AS m FROM nci_audit WHERE tenant_id = $1', [tenantId]);
      const have = Number(max.rows[0].m);
      for (const e of next.audit) {
        if (e.seq <= have) continue; // audit rows are append-only; never rewritten
        await client.query(
          `INSERT INTO nci_audit (tenant_id, seq, at, actor, action, subject, detail, prev_hash, hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [tenantId, e.seq, e.at, e.actor, e.action, e.subject, e.detail, e.prevHash, e.hash],
        );
      }
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async load(tenantId: string): Promise<NciSnapshot | undefined> {
    assertTenantId(tenantId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const row = await client.query('SELECT snapshot FROM nci_snapshot WHERE tenant_id = $1', [tenantId]);
      await client.query('COMMIT');
      return row.rows[0]?.snapshot as NciSnapshot | undefined;
    } finally {
      client.release();
    }
  }
}

/** Same promise as TenantRegistry (own engine per tenant, members only), backed by PostgreSQL. */
export class PgTenantRegistry {
  constructor(private readonly store: PgStore, private readonly clock?: () => string) {}

  withTenant<T>(principal: Principal, tenantId: string, fn: (engine: NciEngine) => T): Promise<T> {
    assertTenantId(tenantId);
    if (!principal.userId || !principal.tenantIds.includes(tenantId)) return Promise.reject(new NciError('access to this tenant is not permitted'));
    return this.store.update(tenantId, (snap) => {
      const engine = snap ? NciEngine.fromSnapshot(tenantId, snap, this.clock) : new NciEngine(tenantId, this.clock);
      const result = fn(engine);
      return { next: engine.toSnapshot(), result };
    });
  }
}
