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
