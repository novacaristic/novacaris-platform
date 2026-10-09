# Tenant & Actor Context

Every tenant-scoped request should carry a validated tenant reference and an actor reference. Actor types are user, agent or service.

The context is descriptive, not proof of identity or authorization. The receiving service must validate the session/credential and independently enforce tenant scope and policy using Builds 01, 08 and 21.

Do not accept a tenant ID from a client as sufficient authorization. Bind tenant context to authenticated identity and server-side membership checks.
