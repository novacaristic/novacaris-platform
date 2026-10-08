# Multi-Tenant Workspace Layer v0.1

Introduces an explicit organization-scoped session boundary and assessment-history store.

Safety rules:
- A session can read only its own organization workspace.
- Assessment history is keyed by organization ID.
- Cross-organization assessment writes are rejected.
- This is an application boundary, not a production identity provider.

Next: connect a real authentication provider, persistent database, and portal API handlers.