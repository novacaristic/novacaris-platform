import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { NciEngine, NciError, type NciSnapshot } from './nci-engine.js';

export interface NciStore {
  load(tenantId: string): NciSnapshot | undefined;
  save(tenantId: string, snapshot: NciSnapshot): void;
}

const TENANT_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
export function assertTenantId(tenantId: string): void {
  if (!TENANT_ID.test(tenantId)) throw new NciError('invalid tenant id');
}

export class MemoryStore implements NciStore {
  private readonly data = new Map<string, string>();
  load(tenantId: string) {
    assertTenantId(tenantId);
    const raw = this.data.get(tenantId);
    return raw ? (JSON.parse(raw) as NciSnapshot) : undefined;
  }
  save(tenantId: string, snapshot: NciSnapshot) {
    assertTenantId(tenantId);
    if (snapshot.tenantId !== tenantId) throw new NciError('snapshot tenant does not match');
    this.data.set(tenantId, JSON.stringify(snapshot));
  }
}

/** One JSON file per tenant. For local development and demos, not for production. */
export class FileStore implements NciStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  private path(tenantId: string) {
    assertTenantId(tenantId);
    return join(this.dir, `${tenantId}.json`);
  }
  load(tenantId: string) {
    const p = this.path(tenantId);
    return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as NciSnapshot) : undefined;
  }
  save(tenantId: string, snapshot: NciSnapshot) {
    if (snapshot.tenantId !== tenantId) throw new NciError('snapshot tenant does not match');
    const p = this.path(tenantId);
    writeFileSync(`${p}.tmp`, JSON.stringify(snapshot, null, 2));
    renameSync(`${p}.tmp`, p);
  }
}

export interface Principal {
  userId: string;
  tenantIds: readonly string[]; // tenants this person may access
}

/** Gives each tenant its own engine and refuses access to tenants a person does not belong to. */
export class TenantRegistry {
  constructor(private readonly store: NciStore, private readonly clock?: () => string) {}

  withTenant<T>(principal: Principal, tenantId: string, fn: (engine: NciEngine) => T): T {
    assertTenantId(tenantId);
    if (!principal.userId || !principal.tenantIds.includes(tenantId)) throw new NciError('access to this tenant is not permitted');
    const snap = this.store.load(tenantId);
    const engine = snap ? NciEngine.fromSnapshot(tenantId, snap, this.clock) : new NciEngine(tenantId, this.clock);
    const result = fn(engine);
    this.store.save(tenantId, engine.toSnapshot());
    return result;
  }
}
