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
- Built-in OpenAI Responses API executor wired into the secure runtime when NOVA_AGENT_PROVIDER=openai; a reviewed custom executor module may override it.
- Without a custom executor module, the built-in OpenAI adapter is deliberately text-only (empty tool allowlist); external side effects require a reviewed module and the per-tool invokeTool authorization/audit gate.
- OpenAI Responses API adapter with bounded tool-call steps/output tokens, request cancellation, an explicit application-owned tool allowlist, and every registered tool routed through the runtime authorization/audit callback.
- Deny-by-default permission policy with tenant checks, capability allowlists, active-state checks, grant expiry checks, and fail-closed handling when human approval is pending.
- Unit tests for lifecycle rules, duplicate prevention, capability policy, self-approval denial, and tenant-scope denial.

## API
When enabled, the runtime exposes:
- POST /api/agents — request a new agent specification.
- POST /api/agents/:id/transition — request an allowed lifecycle transition.
- POST /api/agents/:id/permissions — grant a capability, or send `{"action":"REVOKE","capability":"..."}` to revoke; requires `agent.permission.grant`.
- POST /api/tasks and GET /api/tasks/:id — submit and inspect tenant-scoped tasks; requires `agent.task.submit` / `agent.task.read`, plus a live explicit capability grant.
- POST /api/tasks/:id/approve — approve a high-risk queued action; requires `agent.task.approve`, and the task requester cannot approve their own task.

Both routes require a verified Cognito user context and the agent.manage authorization capability. Tenant ID and actor identity come from verified server context, never from request body fields. Creation does not grant execution access. Agents remain inactive until lifecycle and human approval gates are satisfied.

## Safe defaults
- `NOVA_AGENT_FACTORY_ENABLED` defaults to off. Set it to true only after both SQL migrations are reviewed and applied.
- NOVA_AGENT_FACTORY_ENABLED defaults to off in the staging template. Only enable after both SQL migrations are applied and staging readiness checks pass.
- Set NOVA_AGENT_PROVIDER=openai to use the built-in OpenAI Responses API adapter. OPENAI_API_KEY and OPENAI_MODEL must be injected server-side from the staging secret manager; never commit real values.
- The built-in OpenAI adapter is intentionally text-only and has **no external tools by default**. A reviewed NOVA_AGENT_EXECUTOR_MODULE may override it, but each registered tool must call invokeTool(toolName, requiredCapability, operation); do not wire arbitrary tools directly.
- `NOVA_OPENAI_MAX_STEPS` defaults to 6 (maximum 12); `NOVA_OPENAI_MAX_OUTPUT_TOKENS` defaults to 1200 (maximum 8192). Provider response bodies are not forwarded to the model or API clients on errors.
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
- Configure the staging secret manager with an OpenAI API key and a model ID enabled for the project; the repository does not prove that credentials or a specific model are available.
- For external side effects, implement and independently review a narrow tool registry inside a custom executor module. Every external action must use `invokeTool(toolName, requiredCapability, operation)`, which rechecks agent activation and the task's exact capability grant, rejects cross-capability tool calls, writes a pre-side-effect audit record, and fails closed if authorization or pre-audit fails. High-risk task types wait for explicit non-self human approval before entering the worker queue.
- Configure spend budgets, provider retries, metrics/alerts, rate limits, per-tenant quotas, backups/restore, and safe recovery of stale RUNNING tasks before broader rollout.
- Connect the worker's capability check to each individual tool call and each external side effect inside any provider adapter; the generic worker gates task start but cannot inspect opaque adapter internals.
- Add rate limiting, per-tenant quotas, operational metrics, backup/restore, alerting, and end-to-end PostgreSQL tests.
- Configure Cognito issuer/client/group claims, database credentials and TLS through the deployment secret manager.
- Perform end-to-end tenant-isolation, authorization, audit-failure, and abuse-case testing before enabling in production.

This is a backend foundation and integration slice, not a claim that a deployed production service is complete.
