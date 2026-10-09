# Build 51 — NOVA Governed Recovery Execution

## Objective
Allow a separately authorized human to execute a recovery action only after Build 50 records a resolved `downstream_not_executed` decision with evidence. A reconciliation decision is not itself permission to execute.

## Implemented
- Requires a human user actor, authorization-decision reference, and an injected `recovery.execute` authorizer.
- Tenant-scoped case lookup and row lock; only resolved cases with `downstream_not_executed` and resolution evidence qualify.
- Durable execution reservation and idempotency key are committed before the adapter is invoked.
- Injected adapter receives tenant, case, operation, event, execution, idempotency, and authorization references.
- Successful adapter response must include downstream and evidence references; completion and audit evidence are persisted.
- Adapter exceptions or missing response evidence move the execution to `reconciliation_required`; repeating that key is rejected instead of blindly retrying.
- Completed repeated requests with the same key return the persisted result without re-invoking the adapter.
- Execution audit rows are protected from UPDATE/DELETE by a database trigger.

## Safety boundary
The adapter is injected and must be connected only to a specifically approved downstream integration. Tests use synthetic effects; this build does not prove a live EHR write, production identity provider, or production policy engine. Delivery is not exactly-once across an external side effect and database commit. The adapter should honor the supplied idempotency key; ambiguous outcomes require reconciliation, not automatic retry. Database-owner privileges can bypass ordinary trigger protections.
