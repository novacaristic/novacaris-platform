# Idempotency & Failure Semantics

## Durable operation identity

The key scope is tenant + operation + caller-supplied idempotency key. Each request has a deterministic fingerprint of its material payload. Reusing a key with a different fingerprint is a conflict, not a replay.

Production persistence is defined by `sql/build_46_durable_execution.sql`:
- `nova_pilot_operations` records the durable operation state and result.
- `nova_pilot_outbox` stores event deliveries durably and independently of the event sink.
- The unique key on tenant, operation and idempotency key arbitrates concurrent reservations.
- Completion result and outbox insert must commit in one PostgreSQL transaction.

## State and retry rules

- `in_progress`: another worker owns the reservation or the prior result is not yet resolved.
- `completed`: replay returns the original request reference; the downstream adapter is not called again.
- `denied`: the policy gate denied the operation; the adapter is not called.
- `failed_retryable`: adapter failure is known to have happened before a downstream side effect was confirmed; retry may be attempted under the store's atomic state transition.
- `reconciliation_required`: downstream success or timeout is uncertain, or durable result/outbox persistence failed after a downstream side effect. Never blindly re-execute.
- Different payload under the same key returns `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST`.

## Delivery and limits

The outbox dispatcher must retry delivery with bounded backoff, dead-letter repeated failures, and expose queue age and attempt count. A sink failure does not reverse a durable operation completion. A production implementation must use a concrete PostgreSQL store and transaction boundaries; the current test store is a shared-map test double, not a production database adapter.

## Safety boundary

This pilot is synthetic-only. It does not authorize real EHR writes or process patient records. Ambiguous external outcomes require a downstream idempotency lookup or authorized human reconciliation before any retry.


## Durable outbox dispatcher

The PostgreSQL outbox dispatcher lives in `src/postgres-outbox-dispatcher.ts`.

- Claims due rows using `FOR UPDATE SKIP LOCKED` and a bounded lease.
- Persists lease ownership and increments delivery attempts at claim time.
- Only the current lease owner can mark a row delivered or failed.
- Temporary delivery failures are rescheduled with bounded exponential backoff.
- Exhausted deliveries move to `dead_letter`; the original downstream operation is not re-executed.
- Expired or missing leases can be reclaimed after worker interruption.
- Delivery is at-least-once. Consumers must deduplicate using the stable event ID; a worker crash after delivery but before acknowledgement can cause redelivery.

CI starts PostgreSQL 16 and exercises reservation concurrency, atomic operation/outbox persistence, rollback, event delivery, retry scheduling and durable delivery state. These tests use synthetic fixtures and do not authorize live EHR writes.
