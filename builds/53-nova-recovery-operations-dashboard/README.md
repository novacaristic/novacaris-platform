# Build 53 — NOVA Recovery Operations Dashboard & Escalation Workflow

## Objective
Add a durable operator escalation lifecycle for ambiguous recovery executions, suitable for powering a prioritized dashboard and queue.

## Implemented
- Tenant-scoped escalation queue with priority and status filtering, urgent-first ordering, and bounded result limits.
- Escalation creation only for executions in `reconciliation_required`; one escalation per tenant/execution.
- Human authorization and audit references for creation, acknowledgement, assignment, and resolution.
- Lifecycle: `open → acknowledged → resolved`, with row locks and guarded state transitions.
- Optional assignee and due time for operational ownership and SLA tracking.
- Resolution requires evidence and a note; exact same-actor resolution replay is idempotent.
- Append-only audit events cover creation, acknowledgement, reassignment, and resolution.
- Escalation operations never call an execution adapter or mutate recovery execution status.

## Safety boundary
This build supplies the backend and persistence needed by an operations dashboard; it is not a deployed frontend or alerting integration. Tests use synthetic PostgreSQL records. The host must supply authenticated human context and a real policy authorizer. Due times are stored for SLA tracking; no timer, paging, or notification delivery is implemented here.
