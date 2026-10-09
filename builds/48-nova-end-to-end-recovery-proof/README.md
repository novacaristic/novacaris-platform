# Build 48 — NOVA End-to-End Integration & Recovery Proof

## Objective
Prove the synthetic first-integration path across the real PostgreSQL operation store, the NOVA pilot orchestrator, the durable outbox, and the outbox dispatcher. This build composes Builds 46–47 rather than treating the components only as isolated units.

## Covered proof points
- A policy-allowed synthetic request executes its downstream adapter once.
- Operation completion and its event are committed together to PostgreSQL.
- A separately connected observer can read the persisted operation and pending outbox event.
- Recreating the pilot runtime and replaying the same idempotency key/payload returns a duplicate result without repeating the downstream action.
- The durable event can be dispatched and its delivered state is persisted.
- Policy denial prevents the downstream adapter from running.
- Tenant-context mismatch fails closed before reservation, policy evaluation, or downstream execution.

## Verification
The integration suite is registered in `npm run test:pilot` and `tsconfig.pilot.json`. GitHub Actions supplies PostgreSQL 16 through its service container; the end-to-end suite is skipped locally when `DATABASE_URL` is absent.

## Safety and limits
All downstream references and payloads in this build are synthetic test fixtures. This is integration evidence, not production authorization, clinical validation, security certification, or permission to write to a live EHR. Outbox delivery is **at-least-once**: event consumers must be idempotent. A crash after an external side effect but before durable completion can still require reconciliation; this test does not prove exactly-once external execution or resolve ambiguous downstream outcomes.
