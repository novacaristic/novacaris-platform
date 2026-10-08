# Tenant Model

A tenant represents an independent organizational operating boundary.

Tenant context should be established before protected work begins.

Tenant context includes:
- tenant ID
- organization ID
- authenticated user
- membership
- role
- permitted scope

Tenant ID should be propagated through relevant requests, jobs, events and audit records.

A tenant identifier supplied by a client must not be trusted without server-side authorization.
