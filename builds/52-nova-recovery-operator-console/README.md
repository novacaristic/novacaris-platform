# Build 52 — NOVA Recovery Reconciliation & Operator Console

## Objective
Provide a tenant-scoped operational queue for recovery executions and a human-reviewed, evidence-backed way to record the disposition of ambiguous outcomes.

## Implemented
- Lists recovery executions joined to their reconciliation cases and any operator review, ordered with ambiguous outcomes first.
- Queue reads require a human actor and an explicit `recovery.queue.read` authorization decision.
- Limits results to 100 rows and supports status filtering.
- Ambiguous reviews require a human actor, authorization decision reference, injected `recovery.ambiguous.review` authorization, evidence reference, note, and an allowed disposition.
- Reviews are tenant-scoped, row-locked, idempotent for an exact replay, and reject conflicting second reviews.
- Writes review and append-only audit evidence.
- Review is deliberately separate from execution: it does not mutate execution status, re-run an adapter, or authorize another recovery execution.

## Safety boundary
The console is a backend operator service/read model, not a deployed web UI. Tests use synthetic PostgreSQL records. A reviewed `downstream_not_executed` disposition does not itself restart execution; a future explicit workflow must separately authorize any new attempt. Production identity, policy engine, UI, alerting, and live EHR integrations remain outside this build.
