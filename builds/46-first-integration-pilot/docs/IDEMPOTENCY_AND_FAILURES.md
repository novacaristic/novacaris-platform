# Idempotency & Failure Semantics

Pilot key scope: tenant + operation + caller-supplied idempotency key.

Expected behavior:
- repeated successful key: return duplicate status and original request reference
- denied operation: do not call adapter
- adapter error: return explicit failure
- event-write error: report failure and flag reconciliation needs
- mismatched tenant: deny before policy/adapter execution

The demonstration stores keys in process memory and does not survive restart. A production adapter must use durable storage, a request fingerprint, transactional result persistence and an outbox/reconciliation strategy so an external success followed by event-write failure cannot silently create duplicate side effects.
