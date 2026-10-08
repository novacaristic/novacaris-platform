# CI & Test Harness v0.5

The repository now has continuous typechecking plus deterministic security, readiness, and OIDC tests.

## CI

GitHub Actions runs on pushes and pull requests:

1. checkout
2. Node 20
3. npm install
4. TypeScript typecheck
5. security self-test

## Local tests

The test harness includes focused checks for:

- secure session IDs
- Agent Registry / Permission Registry
- human authorization
- Evidence Ledger
- organization isolation
- agent action ceilings
- readiness scoring
- OIDC issuer/audience/expiry/subject validation

## PostgreSQL integration

The repository adapter is intentionally database-driver neutral. A subsequent environment-specific integration job can provision PostgreSQL, run migrations, establish `app.organization_id`, and verify RLS with two organizations.

No PHI or production credentials belong in CI.
