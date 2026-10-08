# Migration Policy

Database migrations are versioned, checksum-tracked and associated with a release.

Rules:

1. Never silently mutate production schema.
2. Every migration has an identifiable key.
3. Applied migrations are retained as evidence.
4. Destructive migrations require explicit review.
5. Backward-compatible changes are preferred for rolling deployments.
6. Rollback plans must account for both application and schema state.
7. Migration failures must block release completion.

Build 23 does not permit an application to claim deployment success when required migrations failed.
