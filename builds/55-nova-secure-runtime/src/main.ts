import { resolve } from "node:path";
import type { RequestContext } from "../../../builds/44-shared-platform-foundation/src/contracts";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { RecoveryOperationsApi, type AuthenticatedContextResolver } from "../../../builds/54-nova-recovery-operations-dashboard-ui/src/recovery-operations-api";
import { RecoveryOperatorConsole } from "../../../builds/52-nova-recovery-operator-console/src/recovery-operator-console";
import { RecoveryEscalations } from "../../../builds/53-nova-recovery-operations-dashboard/src/recovery-escalations";
import { createRecoveryHttpServer } from "./recovery-http-server";

interface HostSecurityAdapter {
  resolveContext: AuthenticatedContextResolver;
  authorize: (context: RequestContext, action: string) => Promise<boolean>;
}
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`STARTUP_BLOCKED_MISSING_${name}`);
  return value;
}
async function main(): Promise<void> {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const securityModulePath = requiredEnv("NOVA_SECURITY_ADAPTER_MODULE");
  const port = Number(process.env.PORT ?? "8080");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("STARTUP_BLOCKED_INVALID_PORT");
  const securityUrl = pathToFileURL(resolve(securityModulePath)).href;
  const security = await import(securityUrl) as Partial<HostSecurityAdapter>;
  if (typeof security.resolveContext !== "function" || typeof security.authorize !== "function") {
    throw new Error("STARTUP_BLOCKED_SECURITY_ADAPTER_CONTRACT");
  }
  const pool = new Pool({ connectionString: databaseUrl, max: Number(process.env.DB_POOL_MAX ?? "10"), connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
  pool.on("error", error => process.stderr.write(`postgres_pool_error: ${error.message}\n`));
  const authorize = security.authorize as HostSecurityAdapter["authorize"];
  const operators = new RecoveryOperatorConsole(pool, (context, action) => authorize(context, action));
  const escalations = new RecoveryEscalations(pool, (context, action) => authorize(context, action));
  const api = new RecoveryOperationsApi(security.resolveContext as AuthenticatedContextResolver, operators, escalations);
  const server = createRecoveryHttpServer({ api, allowedOrigin: process.env.NOVA_ALLOWED_ORIGIN });
  server.listen(port, process.env.HOST ?? "0.0.0.0", () => process.stdout.write(`nova_recovery_runtime_listening port=${port}\n`));
  const shutdown = (signal: string) => {
    process.stdout.write(`nova_recovery_runtime_shutdown signal=${signal}\n`);
    server.close(() => { void pool.end().finally(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
main().catch(error => {
  process.stderr.write(`nova_recovery_runtime_startup_blocked: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
