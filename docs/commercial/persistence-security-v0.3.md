# Persistence & Security v0.3

Adds PostgreSQL-shaped persistence contracts for actions, authorization requests, and Evidence Ledger entries, plus organization-scoped Row Level Security policies.

Every customer table is constrained by `current_setting('app.organization_id', true)`. The application must establish that setting from the authenticated organization context before customer queries.

RLS complements application role authorization; it does not replace it.

This is a production-shaped security boundary, not a claim that PostgreSQL, OIDC, or PHI infrastructure is deployed.
