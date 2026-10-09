# Build 56 — NOVA Deployment Readiness & Live Environment Smoke Tests

## Implemented
- Fail-closed configuration preflight for PostgreSQL URL, host security adapter path, exact allowed origin, TCP port, and bounded database pool size.
- Database readiness probe that returns sanitized dependency status and never exposes raw connection errors.
- Live smoke script at `scripts/deployment-smoke.mjs`. It tests liveness, database readiness, dashboard delivery, unauthenticated API denial, and unknown-route rejection.
- Machine-readable JSON evidence report with run ID, timestamps, pass/fail checks, durations, and explicit limitations. The report is printed to stdout and contains no credentials or response bodies.
- Unit tests for configuration failures, valid configuration, TLS warnings, and database readiness behavior.

## Live smoke test
After deploying Build 55 with the reviewed security adapter and migrations:
```sh
NOVA_BASE_URL=https://your-ops-origin.example node builds/56-nova-deployment-readiness/scripts/deployment-smoke.mjs
```
The command exits non-zero when any check fails and prints a JSON report. Do not use a public origin with real patient data until the security review and access controls are complete.

## Integration requirements
Build 55 now exposes `GET /readyz`; startup validates the required PostgreSQL URL, trusted security-adapter module path, exact allowed origin, port, and pool size. The readiness endpoint runs a PostgreSQL `SELECT 1` probe and returns HTTP 503 when the database is unavailable or the probe is not configured. The host must still supply a real identity/session resolver and authorization policy.

## Evidence boundary
CI tests validate the helper and smoke-script source can be integrated, but they do not mean a live deployment was performed. The live smoke script must be run against a deployed environment to generate real environment evidence. This build does not apply migrations, create secrets, provision infrastructure, or connect to a live EHR.
