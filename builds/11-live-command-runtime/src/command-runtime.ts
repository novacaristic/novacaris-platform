/**
 * NovaCarïs Build 11 — Command Runtime reference implementation.
 *
 * This module is intentionally framework-neutral.
 * Production adapters must supply authenticated session context,
 * policy evaluation, persistence, and downstream execution.
 */

export type CommandType =
  | "investigate"
  | "prepare"
  | "request_approval";

export interface CommandContext {
  tenantId: string;
  userId: string;
  sessionId: string;
}

export interface CommandRequest {
  type: CommandType;
  cardId?: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface PolicyResult {
  allowed: boolean;
  requiresAuthorization: boolean;
  policyRequestId?: string;
  reason?: string;
}

export interface CommandResult {
  commandRequestId: string;
  correlationId: string;
  status: string;
  policy: PolicyResult;
  result?: Record<string, unknown>;
}

export interface CommandDependencies {
  authorizeCommand(context: CommandContext, request: CommandRequest): Promise<PolicyResult>;
  createInvestigation(context: CommandContext, request: CommandRequest): Promise<Record<string, unknown>>;
  createPreparation(context: CommandContext, request: CommandRequest): Promise<Record<string, unknown>>;
  createApprovalRequest(context: CommandContext, request: CommandRequest, policy: PolicyResult): Promise<Record<string, unknown>>;
  persistCommand(context: CommandContext, request: CommandRequest, correlationId: string): Promise<string>;
}

export async function executeCommand(
  deps: CommandDependencies,
  context: CommandContext,
  request: CommandRequest,
): Promise<CommandResult> {
  const correlationId = crypto.randomUUID();
  const commandRequestId = await deps.persistCommand(context, request, correlationId);

  const policy = await deps.authorizeCommand(context, request);

  if (!policy.allowed) {
    return {
      commandRequestId,
      correlationId,
      status: "denied",
      policy,
    };
  }

  if (request.type === "investigate") {
    const result = await deps.createInvestigation(context, request);
    return { commandRequestId, correlationId, status: "accepted", policy, result };
  }

  if (request.type === "prepare") {
    const result = await deps.createPreparation(context, request);
    return { commandRequestId, correlationId, status: "accepted", policy, result };
  }

  const result = await deps.createApprovalRequest(context, request, policy);
  return { commandRequestId, correlationId, status: "approval_requested", policy, result };
}
