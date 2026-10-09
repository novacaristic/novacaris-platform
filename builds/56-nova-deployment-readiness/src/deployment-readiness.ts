export interface RuntimeConfiguration {
  databaseUrl?: string;
  securityAdapterModule?: string;
  allowedOrigin?: string;
  port?: string;
  dbPoolMax?: string;
}
export interface ConfigurationReport {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  checks: Array<{ name: string; passed: boolean; detail: string }>;
}
function validOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.origin === value && !parsed.username && !parsed.password;
  } catch { return false; }
}
export function validateRuntimeConfiguration(config: RuntimeConfiguration): ConfigurationReport {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const checks: ConfigurationReport["checks"] = [];
  const db = config.databaseUrl?.trim() ?? "";
  const adapter = config.securityAdapterModule?.trim() ?? "";
  const origin = config.allowedOrigin?.trim() ?? "";
  const portText = config.port?.trim() || "8080";
  const poolText = config.dbPoolMax?.trim() || "10";
  const port = Number(portText);
  const pool = Number(poolText);
  const databaseOk = /^postgres(?:ql)?:\/\//i.test(db);
  checks.push({ name: "database_url_present", passed: databaseOk, detail: databaseOk ? "PostgreSQL URL is configured." : "DATABASE_URL must be a PostgreSQL URL." });
  if (!databaseOk) blockers.push("DATABASE_URL_INVALID_OR_MISSING");
  const adapterOk = adapter.length > 0;
  checks.push({ name: "security_adapter_configured", passed: adapterOk, detail: adapterOk ? "A host security adapter path is configured; module contract must still be checked at startup." : "NOVA_SECURITY_ADAPTER_MODULE is required." });
  if (!adapterOk) blockers.push("SECURITY_ADAPTER_MISSING");
  const originOk = validOrigin(origin);
  checks.push({ name: "allowed_origin_valid", passed: originOk, detail: originOk ? "A single exact HTTP(S) origin is configured." : "NOVA_ALLOWED_ORIGIN must be a valid exact origin." });
  if (!originOk) blockers.push("ALLOWED_ORIGIN_INVALID_OR_MISSING");
  const portOk = Number.isInteger(port) && port >= 1 && port <= 65535;
  checks.push({ name: "port_valid", passed: portOk, detail: portOk ? `Port ${port} is valid.` : "PORT must be an integer from 1 to 65535." });
  if (!portOk) blockers.push("PORT_INVALID");
  const poolOk = Number.isInteger(pool) && pool >= 1 && pool <= 100;
  checks.push({ name: "database_pool_size_valid", passed: poolOk, detail: poolOk ? `Pool maximum ${pool} is valid.` : "DB_POOL_MAX must be an integer from 1 to 100." });
  if (!poolOk) blockers.push("DB_POOL_MAX_INVALID");
  if (origin.startsWith("http://") && !origin.includes("localhost") && !origin.includes("127.0.0.1")) warnings.push("NON_TLS_ALLOWED_ORIGIN: use HTTPS outside local development.");
  return { ready: blockers.length === 0, blockers, warnings, checks };
}

export interface DependencyReadiness {
  status: "ready" | "not_ready";
  checkedAt: string;
  dependencies: Array<{ name: string; status: "ready" | "not_ready"; detail: string }>;
}
export async function checkDatabaseReadiness(query: () => Promise<unknown>, now: () => Date = () => new Date()): Promise<DependencyReadiness> {
  const checkedAt = now().toISOString();
  try {
    await query();
    return { status: "ready", checkedAt, dependencies: [{ name: "postgresql", status: "ready", detail: "SELECT 1 succeeded." }] };
  } catch {
    return { status: "not_ready", checkedAt, dependencies: [{ name: "postgresql", status: "not_ready", detail: "Database readiness probe failed; details withheld." }] };
  }
}
