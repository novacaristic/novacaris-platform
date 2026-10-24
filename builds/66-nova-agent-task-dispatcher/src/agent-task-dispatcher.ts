import { createHash } from "node:crypto";
import type { AgentCapability, AgentFactoryStore, AgentRecord } from "../../65-nova-agent-factory/src/agent-factory.js";

export type AgentTaskStatus = "QUEUED" | "RUNNING" | "WAITING_APPROVAL" | "SUCCEEDED" | "FAILED" | "CANCELLED";
export interface AgentTask {
  id: string;
  tenantId: string;
  agentId: string;
  createdBy: string;
  taskType: string;
  capability: AgentCapability;
  input: Record<string, unknown>;
  status: AgentTaskStatus;
  idempotencyKey: string;
  requestFingerprint: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: Record<string, unknown>;
  errorCode?: string;
  attemptCount: number;
}
export interface TaskPrincipal { tenantId: string; subject: string; role: "owner" | "administrator" | "supervisor" | "agent"; }
export interface TaskPermissionDecision { allowed: boolean; requiresHumanApproval: boolean; reason: string; }
export interface AgentTaskStore {
  findByIdempotency(tenantId: string, agentId: string, key: string): Promise<AgentTask | undefined>;
  create(task: AgentTask): Promise<void>;
  claim(workerId: string, limit: number, leaseSeconds: number): Promise<AgentTask[]>;
  finish(task: AgentTask, workerId: string): Promise<void>;
  fail(taskId: string, tenantId: string, workerId: string, errorCode: string, retryable: boolean, maxAttempts: number): Promise<void>;
  get(tenantId: string, taskId: string): Promise<AgentTask | undefined>;
}
export interface SubmitTaskInput {
  principal: TaskPrincipal;
  agentId: string;
  taskType: string;
  capability: AgentCapability;
  input: Record<string, unknown>;
  idempotencyKey: string;
}
export interface AgentTaskPolicy {
  authorize(principal: TaskPrincipal, agent: AgentRecord, capability: AgentCapability): Promise<TaskPermissionDecision>;
}
function requireString(value: string, code: string, max = 200): void {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(code);
}
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}
function fingerprint(input: SubmitTaskInput): string {
  const canonical = JSON.stringify(canonicalize({ taskType: input.taskType, capability: input.capability, input: input.input }));
  return createHash("sha256").update(canonical).digest("hex");
}
const newId = () => "task_" + crypto.randomUUID();

export class AgentTaskDispatcher {
  constructor(
    private readonly agents: AgentFactoryStore,
    private readonly store: AgentTaskStore,
    private readonly policy: AgentTaskPolicy,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async submit(input: SubmitTaskInput): Promise<AgentTask> {
    requireString(input.principal.tenantId, "TENANT_REQUIRED");
    requireString(input.principal.subject, "ACTOR_REQUIRED");
    requireString(input.agentId, "AGENT_ID_REQUIRED");
    requireString(input.taskType, "TASK_TYPE_REQUIRED", 100);
    requireString(input.idempotencyKey, "IDEMPOTENCY_KEY_REQUIRED", 200);
    if (!input.input || typeof input.input !== "object" || Array.isArray(input.input)) throw new Error("TASK_INPUT_MUST_BE_OBJECT");
    if (Buffer.byteLength(JSON.stringify(input.input), "utf8") > 32 * 1024) throw new Error("TASK_INPUT_TOO_LARGE");

    const existing = await this.store.findByIdempotency(input.principal.tenantId, input.agentId, input.idempotencyKey);
    const requestFingerprint = fingerprint(input);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw new Error("IDEMPOTENCY_FINGERPRINT_CONFLICT");
      return existing;
    }
    const agent = await this.agents.get(input.principal.tenantId, input.agentId);
    if (!agent) throw new Error("AGENT_NOT_FOUND");
    if (agent.lifecycle !== "ACTIVE") throw new Error("AGENT_NOT_ACTIVE");
    if (!agent.profile.capabilities.includes(input.capability)) throw new Error("CAPABILITY_NOT_IN_AGENT_PROFILE");
    const decision = await this.policy.authorize(input.principal, agent, input.capability);
    if (!decision.allowed && !decision.requiresHumanApproval) throw new Error("TASK_PERMISSION_DENIED:" + decision.reason);

    const now = this.now().toISOString();
    const task: AgentTask = {
      id: newId(), tenantId: input.principal.tenantId, agentId: agent.id, createdBy: input.principal.subject,
      taskType: input.taskType.trim(), capability: input.capability, input: input.input,
      status: decision.requiresHumanApproval ? "WAITING_APPROVAL" : "QUEUED",
      idempotencyKey: input.idempotencyKey, requestFingerprint, createdAt: now, attemptCount: 0,
      ...(decision.requiresHumanApproval ? { errorCode: "HUMAN_APPROVAL_REQUIRED" } : {}),
    };
    await this.store.create(task);
    return task;
  }

  async runBatch(input: {
    workerId: string; limit?: number; leaseSeconds?: number; maxAttempts?: number;
    execute: (task: AgentTask) => Promise<Record<string, unknown>>;
  }): Promise<{ claimed: number; succeeded: number; failed: number }> {
    requireString(input.workerId, "WORKER_ID_REQUIRED", 120);
    const limit = input.limit ?? 10;
    const leaseSeconds = input.leaseSeconds ?? 60;
    const maxAttempts = input.maxAttempts ?? 3;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("TASK_BATCH_LIMIT_INVALID");
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900) throw new Error("TASK_LEASE_INVALID");
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) throw new Error("TASK_MAX_ATTEMPTS_INVALID");
    const claimed = await this.store.claim(input.workerId, limit, leaseSeconds);
    let succeeded = 0; let failed = 0;
    for (const task of claimed) {
      try {
        const result = await input.execute(task);
        if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("TASK_RESULT_INVALID");
        await this.store.finish({ ...task, status: "SUCCEEDED", result, finishedAt: this.now().toISOString() }, input.workerId);
        succeeded++;
      } catch (error) {
        const code = error instanceof Error ? error.message.slice(0, 200) : "TASK_EXECUTION_FAILED";
        await this.store.fail(task.id, task.tenantId, input.workerId, code, task.attemptCount < maxAttempts, maxAttempts);
        failed++;
      }
    }
    return { claimed: claimed.length, succeeded, failed };
  }

  get(tenantId: string, taskId: string): Promise<AgentTask | undefined> {
    requireString(tenantId, "TENANT_REQUIRED");
    requireString(taskId, "TASK_ID_REQUIRED");
    return this.store.get(tenantId, taskId);
  }
}
