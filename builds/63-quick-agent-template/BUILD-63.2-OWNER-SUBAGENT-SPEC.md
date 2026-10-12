# Build 63.2 — Owner-Managed Agents and Safe Subagent Delegation

## Objective
Let an authorized agent owner configure and request deployment of an agent quickly, manage its permitted capabilities, and allow agents to propose/create subagents for bounded subtasks—without allowing privilege escalation or self-approval.

This is a design contract. It does not claim these controls are already wired into the runtime.

## Core rules
1. **Owner controls within policy.** An authenticated owner may configure purpose, inputs/outputs, approved tools, limits, model choice where supported, timeout, budget, and deployment target only within the permissions granted to that owner. Tenant administrators and platform policy remain higher authority.
2. **Permission changes are separate privileged actions.** The owner cannot grant a capability they do not possess, bypass a platform deny rule, or approve their own request when separation of duties is required. High-impact permission changes require an independent authorized approver.
3. **Subagents are children, not clones.** A parent may propose a child manifest and task, but cannot pass on more permissions than the parent's effective permissions. Child permissions are the intersection of parent authority, owner grant, platform policy, and child task requirements.
4. **No privilege inheritance by default.** Children receive no credentials, memory, tool access, or secrets from a parent unless explicitly granted and validated for that child task.
5. **Bound delegation.** Every child has a unique agent ID, version, parent ID, owner, task ID, expiration, depth limit, resource/budget limit, and audit correlation. Parent-child delegation chains have configurable maximum depth and fan-out.
6. **Short-lived authority.** Task capabilities expire when the task ends, is cancelled, times out, or the owner revokes them. Prefer short-lived credentials; never store secrets in prompts or manifests.
7. **Central enforcement.** Runtime/API/tool gateway enforces every action. Prompts and manifest fields are declarations, not security boundaries.
8. **Deny by default.** Unknown capabilities, unregistered children, failed identity checks, unavailable policy service, or failed required audit writes must block execution.
9. **Tier 2 stays gated.** Child agents cannot self-approve consequential actions. Tier 2 execution requires authenticated, authorized human approval bound to exact action parameters and target. A parent agent cannot substitute for that human.
10. **Owner offboarding and revocation.** Suspending an owner or parent agent blocks new deployments and delegation; define whether existing children are suspended immediately (default: suspend and reconcile).
11. **Budget and loop protection.** Limit depth, fan-out, wall-clock time, tool calls, token/cost budget, retries, and repeated equivalent tasks. Stop and alert on loops.
12. **Traceability.** Audit owner changes, effective permissions, deployment state transitions, child creation, delegation decisions, tool calls, approval decisions, failures, cancellations, and outcomes.

## Proposed agent lifecycle
`draft -> validated -> dry_run -> owner_review -> registered -> staging -> active`
Possible terminal/control states: `rejected`, `suspended`, `revoked`, `retired`.

Moving to active requires successful validation and the applicable approvals. A template launcher may create a draft folder, but must not claim it has registered or deployed the agent.

## Effective permission calculation
For every action, calculate and record:
`effective_permissions = platform_policy ∩ tenant_policy ∩ owner_grant ∩ parent_delegation ∩ child_task_scope`
Any missing or invalid required component results in deny. The child can narrow the inherited scope but cannot widen it. The system must re-authorize when a task changes, a trust boundary is crossed, or a read-only action becomes a write action.

## Owner console requirements
- Show agent ID, version, owner, state, current effective permissions, expiry, parent/child relationships, budget, and last health check.
- Show permissions as readable capabilities (e.g. `documents:read`), not vague “full access” switches.
- Distinguish requested, approved, and effective permissions.
- Preview permission diffs before save.
- Require re-authentication for sensitive changes.
- Offer suspend/revoke controls and show whether children were also suspended.
- Display audit events and failed deployment checks.
- Prevent owners from editing the platform policy or audit ledger through the agent configuration UI.

## Failure handling
- Policy service unavailable: deny privileged actions; do not fall back to prompt decisions.
- Child registry write fails: do not start the child.
- Audit persistence fails: block protected side effects.
- Parent cancelled or revoked: stop child task tree, revoke capabilities, and reconcile in-flight work.
- Child exceeds time/budget/depth: terminate safely, log reason, and notify owner.
- Child requests extra access: pause and request owner/admin workflow; never self-grant.
- Approval action changes after approval: invalidate approval and require a new one.
- Partial external side effect: mark outcome uncertain, stop retries, and use an idempotent reconciliation/compensation path.

## Test plan and release gates

### Gate A — Template and manifest
- Parse example manifest as JSON.
- Validate against JSON Schema.
- Reject missing required fields, unknown fields, invalid names/versions, negative limits, and unsafe state changes.
- Confirm new agent starts in draft + dry_run with zero tools.
- Confirm launcher refuses to overwrite an existing folder and cleans partial output on error.

### Gate B — Owner authorization
- Authorized owner changes allowed settings within own tenant.
- Non-owner cannot modify agent.
- Owner cannot grant tools/capabilities absent from their own grant.
- Tenant A owner cannot read or modify Tenant B agents.
- Unauthorized permission elevation is denied and audited.
- Revoke/suspend takes effect on next authorization check.

### Gate C — Subagent containment
- Parent creates a child with a unique identity and parent link.
- Child receives only explicitly approved task-scoped permissions.
- Child cannot inherit secrets or broad parent memory by default.
- Child cannot elevate above parent/owner/policy intersection.
- Unregistered or forged child identity is denied.
- Maximum depth, fan-out, time, cost, and tool-call caps are enforced.
- Parent cancellation/revocation suspends child work and revokes task capabilities.
- Loop and repeated-task detection stops runaway creation.

### Gate D — Trust Gate and approval
- Tier 1 allowlisted action succeeds once with idempotency protection.
- Unknown action is denied.
- Tier 2 action fails without human approval.
- Expired, replayed, wrong-target, or parameter-mismatched approval is rejected.
- Agent cannot approve itself or another agent's Tier 2 action.
- Approval is invalidated if action payload changes.

### Gate E — Durable audit and recovery
- Success, denial, permission changes, delegation, child creation, cancellation, and failures produce audit events.
- Audit write failure blocks protected side effects.
- Duplicate idempotency key does not repeat a side effect.
- Downstream timeout produces a known/unknown outcome state and no blind duplicate retry.
- Compensation/reconciliation is tested for each action marked reversible.
- Audit records are not mutable by agent/owner roles.

### Gate F — Operational and deployment
- Staging health check and smoke test pass.
- Secret scanning finds no committed credentials.
- Cost/time/loop caps tested.
- Kill switch stops parent and child execution.
- Backup/restore and policy rollback tested.
- Human release approval recorded.
- Windows PowerShell launcher actually runs on Windows; Docker integration is separately verified.

## Recommended execution order
1. Validate Build 63 files and PowerShell script in CI/Windows.
2. Add a manifest schema validation test.
3. Add owner permission service and effective-permission calculation in the host runtime.
4. Add agent registry and lifecycle state machine.
5. Add child-agent proposal/registration with subset-only delegated permissions.
6. Add owner-facing configuration and suspend/revoke controls.
7. Add integration and adversarial tests above.
8. Only after passing staging tests, consider a limited production pilot with synthetic/non-sensitive data first.

## Acceptance criteria
Build 63.2 is not complete until the host runtime—not merely the docs—enforces owner scope, parent-child permission narrowing, unique identities, delegation limits, approvals, revocation, and durable audit; and CI demonstrates the critical positive and negative tests.