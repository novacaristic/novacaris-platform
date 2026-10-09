# Migration Waves

## Wave 0 — Inventory
Discover actual interfaces, owners, schemas and consumers.

## Wave 1 — Shared non-side-effecting contracts
Adopt request context, API envelopes, correlation and error codes in low-risk read paths.

## Wave 2 — Internal events
Adopt versioned event envelopes and deduplication semantics.

## Wave 3 — Governed side effects
Migrate commands, billing changes and external connectors only after authorization, idempotency and audit tests pass.

## Wave 4 — Sensitive workflows
Migrate clinical, privacy-sensitive and external EHR workflows with dedicated review and controlled test fixtures.

## Wave 5 — Retirement
Retire old interfaces only when all consumers have migrated and telemetry/test evidence confirms safe removal.