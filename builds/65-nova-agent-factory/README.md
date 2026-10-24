# Build 65 — NOVA Agent Factory & Business-Agent Backend

## Purpose
Build 65 adds the first backend slice for command-driven creation and lifecycle governance of Mr. NOVA specialist agents, extending the existing NOVA CORE, Cognito security adapter, secure runtime, and evidence-ledger foundations.

## Included
- Typed agent specification and lifecycle state machine.
- PostgreSQL-backed store with optimistic version checks and atomic agent-state/audit-event transactions.
- Authenticated API mounted in the existing secure runtime behind an explicit feature flag.
- Default specialist catalog: sales, marketing, financial analysis, research/due diligence, operations, compliance/evidence, funding intelligence, and security/risk.
- PostgreSQL schema for profiles, permission grants, creation requests, tasks, and audit events.
- Owner-authorized permission grant/revoke API with atomic audit writes and grant expiry support.
- Tenant-scoped task submission/status API, idempotency keys, and a gated worker that re-checks active lifecycle and explicit permission immediately before execution.
- External executor adapter contract loaded only when explicitly configured; task submission fails closed with HTTP 503 if no executor is configured.
- Deny-by-default permission policy with tenant checks, capability allowlists, active-state checks, grant expiry checks, and fail-closed handling when human approval is pending.
- Unit tests for lifecycle rules, duplicate prevention, capability policy, self-approval denial, and tenant-scope denial.

## API
When enabled, the runtime exposes:
- POST /api/agents — request a new agent specification.
- POST /api/agents/:id/transition — request an allowed lifecycle transition.
- POST /api/agents/:id/permissions — grant a capability, or send `{"action":"REVOKE","capability":"..."}` to revoke; requires `agent.permission.grant`.
- POST /api/tasks and GET /api/tasks/:id — submit and inspect tenant-scoped tasks; requires `agent.task.submit` / `agent.task.read`, plus a live explicit capability grant.

Both routes require a verified Cognito user context and the agent.manage authorization capability. Tenant ID and actor identity come from verified server context, never from request body fields. Creation does not grant execution access. Agents remain inactive until lifecycle and human approval gates are satisfied.

## Safe defaults
- `NOVA_AGENT_FACTORY_ENABLED` defaults to off. Set it to true only after both SQL migrations are reviewed and applied.
- `NOVA_AGENT_EXECUTOR_MODULE` is optional and must point to a reviewed module exporting `createAgentTaskExecutor()` or `agentTaskExecutor`. Without it, the worker does not start and task submissions return 503.
- New agents start at SPECIFIED; isolated build/test work can happen before activation approval.
- Activation approval is required by default. Requesters cannot approve their own agent.
- Unknown capabilities are rejected; no automatic permission escalation.
- Default maximum: 25 active agents per tenant; autonomous agent creation disabled.
- Privileged side effects must be blocked if authorization or audit persistence fails.
- Generated code is untrusted even if tests pass.

## Local validation
Run npm run check:agent-factory for the isolated typecheck and unit tests. The repository's pilot workflow also includes the new factory source and tests.

## Still required before production
- Complete review of CI results and security review of this PR.
- Apply migration in a controlled environment and run PostgreSQL integration tests.
- Implement and independently review a provider-specific executor adapter, including provider credentials from a secret manager, spend/token limits, tool allowlists, cancellation, and content/data handling. The generic worker boundary exists, but no live model provider is bundled or configured.
- Connect the worker's capability check to each individual tool call and each external side effect inside any provider adapter; the generic worker gates task start but cannot inspect opaque adapter internals.
- Add rate limiting, per-tenant quotas, operational metrics, backup/restore, alerting, and end-to-end PostgreSQL tests.
- Configure Cognito issuer/client/group claims, database credentials and TLS through the deployment secret manager.
- Perform end-to-end tenant-isolation, authorization, audit-failure, and abuse-case testing before enabling in production.

This is a backend foundation and integration slice, not a claim that a deployed production service is complete.
