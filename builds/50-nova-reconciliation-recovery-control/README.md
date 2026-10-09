# Build 50 — NOVA Reconciliation & Recovery Control

## Objective
Provide a tenant-scoped, human-authorized reconciliation case workflow for operations whose downstream outcome is ambiguous. Preserve evidence and the decision trail without treating a human decision as permission to automatically retry a side effect.

## Implemented
- Opens an idempotent reconciliation case only for an operation already marked `reconciliation_required`.
- Requires a human user context and an injected authorization decision for opening and resolving cases.
- Records a stable event ID, downstream reference, reason code, resolution evidence reference, reviewer, note, and timestamps.
- Supports explicit resolutions: `downstream_completed`, `downstream_not_executed`, and `manual_follow_up`.
- Writes opening and resolution entries to a tenant-scoped audit table protected against UPDATE and DELETE by a PostgreSQL trigger.
- Makes repeat opening idempotent; permits a repeat resolution only when it exactly matches the prior resolution, evidence, note, and reviewer.
- Fails closed on missing evidence, unauthorized access, non-human actors, missing cases, and cross-tenant lookups.

## Safety boundary
Resolving a case does not change the original operation status, re-run an adapter, grant authorization, or write to an EHR. Even `downstream_not_executed` is a recorded decision, not an execution command. A separate governed workflow must verify prerequisites and authorize any future action. Audit append-only protection is implemented at the database trigger level for UPDATE/DELETE, subject to database-owner/administrator controls.

## Verification
Registered in `npm run test:pilot` and `tsconfig.pilot.json`. The integration suite uses the PostgreSQL service in CI and synthetic records only; it is skipped locally if `DATABASE_URL` is absent.
