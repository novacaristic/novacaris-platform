# Build 66 — NOVA Agent Task Dispatcher

## Purpose
Build 66 introduces a bounded task-dispatch domain layer for the owner-controlled agent workforce. It builds on Build 65's Agent Factory and Permission Lock. A task is accepted only for an existing, ACTIVE agent with the requested capability, and an injected authorization policy must allow the capability or explicitly mark it as requiring human approval.

## Included in this slice
- Typed task model and task submission service.
- Tenant-scoped task lookup.
- Idempotency-key checks with request fingerprint conflict detection.
- Explicit WAITING_APPROVAL status when policy requires human approval; such tasks are not claimable by workers.
- Bounded worker batch, lease duration, retry count, and payload size.
- PostgreSQL migration for idempotency and worker leases.
- Unit tests for allowed/denied/approval-required paths, idempotency, bounded execution, and tenant scoping.

## API/runtime status
This build is a domain/store slice, not yet mounted into the HTTP runtime. The next integration step must add authenticated task submit/status/cancel/approval routes and wire a production authorization/grant lookup into the policy interface. Do not expose the service directly to untrusted callers.

## Execution safety
The executor is injected by the host; this build does not ship an LLM provider, CRM connector, email sender, payment processor, or autonomous external-action adapter. The host must re-check permissions immediately before every tool call or external side effect. Consequential actions must be held for a scoped human approval and audited before execution.

## Persistence
Apply sql/build_66_agent_task_dispatcher.sql only after reviewing Build 65's schema. The migration adds columns and indexes to nova_agents.tasks. It does not create production infrastructure or credentials.

## Validation status
Unit tests are authored but must be run in CI/local environment before this build is considered verified. No deployment or production readiness is claimed.
