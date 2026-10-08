# Synchronization & Reconciliation

Synchronization must define:
- direction
- source of truth
- cursor/checkpoint
- idempotency
- conflict policy
- deletion semantics
- retry policy
- reconciliation cadence

External success must not be inferred from a local queue acknowledgment.

Material discrepancies should remain visible for review.
