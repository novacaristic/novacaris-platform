# Adapter Contract

Every connector adapter should define:

- connector identity and version
- supported capabilities
- required scopes
- authentication method
- input/output schemas
- timeout behavior
- retry policy
- idempotency behavior
- rate limits
- error normalization
- health check
- webhook verification, when applicable
- data mapping and provenance
- audit/event hooks

Adapters must not bypass policy or write directly around governed integration services.
