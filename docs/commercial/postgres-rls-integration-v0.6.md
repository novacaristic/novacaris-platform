# PostgreSQL RLS Integration v0.6

NovaCarïs now tests organization isolation against a real PostgreSQL 16 service in CI.

## What is verified

- Two organizations are seeded.
- A non-owner database role is used so PostgreSQL RLS is actually enforced.
- Reads are isolated by `app.organization_id`.
- Cross-organization updates cannot modify hidden rows.
- Cross-organization inserts are rejected by `WITH CHECK`.
- Coverage includes organizations, members, workspaces, intakes, assessments, findings, evidence, actions, authorization requests, and the Evidence Ledger.

## Security boundary

The test intentionally runs the RLS assertions as a role that does not own the protected tables. PostgreSQL superusers and table owners can bypass RLS, so they are not valid isolation test subjects.

This test proves the database policy boundary; it does not constitute a production security certification.

## CI

The `postgres-rls` GitHub Actions job starts PostgreSQL 16, applies migrations 001 and 002, and executes `tests/postgres-rls.sql`.
