# Build 49 — NOVA Crash-Window & Concurrent Worker Recovery Proof

## Objective
Exercise failure boundaries that Build 48 deliberately left unresolved: competing dispatchers, the external-sink-success / durable-acknowledgement gap, and stale workers completing after lease reassignment.

## Verified scenarios
- Two PostgreSQL-backed workers race to claim one pending event; the row is claimed once and the attempt count advances once.
- A simulated worker applies a sink effect and crashes before marking the outbox row delivered. After lease expiry, another worker reclaims and retries the event. The sink sees two attempts; a consumer keyed by event ID applies the business effect once.
- A worker whose lease expired cannot mark the event delivered after another worker acquires the lease. The current lease owner can complete it.

## Delivery guarantee and remaining risk
The dispatcher is **at-least-once**, not exactly-once. A crash after a remote side effect but before durable acknowledgement can cause redelivery. Consumers should deduplicate using a stable event ID and make the deduplication record and business effect atomic where possible. If the downstream system cannot provide idempotency or query the outcome, use reconciliation rather than blindly repeating a non-idempotent action.

The tests simulate the crash boundary using real PostgreSQL state and a synthetic in-memory sink. They do not establish atomicity with any external system, prove production deployment safety, or authorize live EHR writes.

## Verification
Registered in `npm run test:pilot` and `tsconfig.pilot.json`. GitHub Actions supplies PostgreSQL 16; the suite is skipped when `DATABASE_URL` is absent.
