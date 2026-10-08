# Build 02 — Data + API

Canonical domain model and API boundary for NovaCarïs.

## Domain
Tenant → User → Patient → Assignment → Encounter → Note → Task → Audit.

The API is tenant-scoped by construction. Client-supplied tenant identifiers are never trusted without server-side identity resolution.

## Rules
- UUID identifiers.
- Idempotency for mutating requests.
- Optimistic concurrency on editable clinical objects.
- Audit event for protected mutations.
- No direct client access to database tables.
