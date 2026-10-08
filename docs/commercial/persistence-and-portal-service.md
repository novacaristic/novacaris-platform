# Persistence & Portal Service v0.1

NovaCarïs now has a provider-neutral persistence contract for organization workspaces, provider intake, and assessment history.

The first implementation is an in-memory repository for development/testing. A production adapter can target PostgreSQL or another approved persistence layer without changing the domain engine.

Portal reads are explicitly organization-scoped through SessionContext. The service refuses a missing workspace and checks organization scope before returning dashboard data.

Production next steps:
1. PostgreSQL adapter with migrations.
2. Real OIDC/session validation.
3. Organization membership and role persistence.
4. Evidence object storage and metadata.
5. API handler connecting the browser to portal-service.