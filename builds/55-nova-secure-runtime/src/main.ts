import { resolve } from "node:path";
import type { RequestContext } from "../../../builds/44-shared-platform-foundation/src/contracts";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { RecoveryOperationsApi, type AuthenticatedContextResolver } from "../../../builds/54-nova-recovery-operations-dashboard-ui/src/recovery-operations-api";
import { RecoveryOperatorConsole } from "../../../builds/52-nova-recovery-operator-console/src/recovery-operator-console";
import { RecoveryEscalations } from "../../../builds/53-nova-recovery-operations-dashboard/src/recovery-escalations";
import { createRecoveryHttpServer } from "./recovery-http-server";
import { checkDatabaseReadiness, validateRuntimeConfiguration } from "../../../builds/56-nova-deployment-readiness/src/deployment-readiness";
import { ClientCaseWorkspace, type WorkspaceContext } from "../../../builds/61-nova-client-case-workspace/src/client-case-workspace";
import { PostgresWorkspaceStore } from "../../../builds/62-nova-durable-workspace/src/postgres-workspace-store";
import { WorkspaceApi } from "../../../builds/62-nova-durable-workspace/src/workspace-api";
import { AgentFactory, defaultFactoryPolicy } from "../../../builds/65-nova-agent-factory/src/agent-factory";
import { AgentFactoryApi, type AgentApiRequest } from "../../../builds/65-nova-agent-factory/src/agent-factory-api";
import { PostgresAgentFactoryStore } from "../../../builds/65-nova-agent-factory/src/postgres-agent-factory-store";

interface HostSecurityAdapter {
  resolveContext: AuthenticatedContextResolver;
  authorize: (context: RequestContext, action: string) => Promise<boolean>;
  resolveWorkspaceContext?: (request: {method:string;path:string;body?:unknown;headers?:Record<string,string|undefined>}) => Promise<WorkspaceContext | null>;
}
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`STARTUP_BLOCKED_MISSING_${name}`);
  return value;
}
async function main(): Promise<void> {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const securityModulePath = requiredEnv("NOVA_SECURITY_ADAPTER_MODULE");
  const allowedOrigin = requiredEnv("NOVA_ALLOWED_ORIGIN");
  const config = validateRuntimeConfiguration({ databaseUrl, securityAdapterModule: securityModulePath, allowedOrigin, port: process.env.PORT, dbPoolMax: process.env.DB_POOL_MAX });
  if (!config.ready) throw new Error(`STARTUP_BLOCKED_CONFIGURATION:${config.blockers.join(",")}`);
  const port = Number(process.env.PORT ?? "8080");
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
  const readiness = { check: () => checkDatabaseReadiness(async () => { await pool.query("SELECT 1"); }) };
  let workspaceApi: WorkspaceApi | undefined;
  if (typeof security.resolveWorkspaceContext === "function") {
    const workspaceStore = new PostgresWorkspaceStore(pool);
    const workspace = new ClientCaseWorkspace(workspaceStore, (context, action) => authorize(context as unknown as RequestContext, action));
    workspaceApi = new WorkspaceApi(security.resolveWorkspaceContext, workspace, (tenantId, noteId) => workspaceStore.listAudit(tenantId, noteId));
  }
  let agentApi: AgentFactoryApi | undefined;
  if (process.env.NOVA_AGENT_FACTORY_ENABLED === "true") {
    const schema = await pool.query<{ready:boolean}>(
      "SELECT to_regclass('nova_agents.agent_profiles') IS NOT NULL AS ready"
    );
    if (!schema.rows[0]?.ready) throw new Error("STARTUP_BLOCKED_AGENT_FACTORY_MIGRATION_REQUIRED");
    const factory = new AgentFactory(new PostgresAgentFactoryStore(pool), defaultFactoryPolicy);
    agentApi = new AgentFactoryApi(
      request => (security.resolveContext as (request: AgentApiRequest) => Promise<RequestContext | null>)(request),
      (context, action) => authorize(context, action),
      factory,
    );
  }
  const server = createRecoveryHttpServer({ api, workspaceApi, agentApi, readiness, allowedOrigin });
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
