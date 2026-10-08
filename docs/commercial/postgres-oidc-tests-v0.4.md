# PostgreSQL, OIDC & Security Tests v0.4

This build makes the persistence/security boundary executable through database-neutral adapters.

## Included
- PostgreSQL repository implementation using the existing scoped database contract
- OIDC claim-validation adapter contract
- Security self-test covering:
  - secure session IDs
  - Agent/Permission authorization
  - human approval ledger
  - organization isolation
  - agent action ceiling

The repository intentionally does not add a database driver or identity-provider SDK. Those remain deployment choices.

## Production boundary
Before production use, connect a vetted PostgreSQL driver and transaction manager, a real OIDC/JWKS verifier, schema validation for persisted JSON, and a CI runner that executes the security suite against isolated test infrastructure.
