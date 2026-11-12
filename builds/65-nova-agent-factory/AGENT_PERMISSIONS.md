# NOVA Agent Permission Lock

## Baseline policy
- Balanced autonomy with strict guardrails: agents may be specified and built in isolated development; activation requires human approval by default.
- No autonomous permission escalation. An agent cannot grant itself capabilities, edit its own permissions, approve its own creation, or bypass NOVA CORE.
- Deny by default: authorization requires authenticated principal, tenant match, active agent, explicit grant, valid expiry, and approval checks.
- Tenant identity comes from verified Cognito context, never caller-supplied tenant fields.
- Action tiers are READ, RECOMMEND, PREPARE, EXECUTE_WITH_APPROVAL and AUTONOMOUS. Autonomous creation is disabled by default.
- Activation, external messages, publishing, record mutation, data export, payments, contracts, clinical decisions and regulatory submissions require scoped human approval by default.
- Default limit: 25 active agents per tenant. Production deployment of generated code requires independent review.
- Audit every creation, transition, grant, denial, delegation, task, approval and external side effect. Audit failure blocks privileged side effects.
- Secrets never enter prompts or agent specs. Health data remains isolated to explicitly authorized healthcare workflows.
- Delegated agents inherit no more authority or data access than the parent agent and user authorization jointly permit.

## Proposed role matrix
| Role | Create specs | Approve activation | Grant permissions | External side effects |
|---|---|---|---|---|
| Owner | Yes | Yes | Yes | Explicit approval per action |
| Administrator | Yes | Only if owner policy delegates | Only if delegated | Explicit approval |
| Supervisor | Request only | No by default | No by default | No by default |
| Agent | Propose only | Never | Never | Explicit scoped grants only |

## Lifecycle
REQUESTED -> SPECIFIED -> BUILDING -> TESTING -> APPROVAL_REQUIRED -> APPROVED -> REGISTERED -> ACTIVE. Invalid transitions are rejected; active agents may be suspended or retired. Requesters cannot approve their own requests.

## Implementation boundary
The permission-policy module implements core deny-by-default checks. Full integration with Cognito context, PostgreSQL grants, human approval, and runtime dispatch remains required before this can be considered end-to-end production enforcement.
