# Application Boundary v0.2

The closed-loop readiness layer now has a framework-neutral HTTP controller and explicit human-review/trust services.

## Boundary

HTTP request → authenticated session → organization scope → role check → application service → domain engine → persistence contract.

## Routes

- GET /api/health
- GET /api/workspace
- GET /api/assessments
- POST /api/assessments
- POST /api/evidence
- PATCH /api/actions/:id

## Human Review

The Human Review Center surfaces action items requiring human attention and authorization requests. Authorization decisions require an authenticated OWNER, ADMIN, or COMPLIANCE role and a written rationale.

## Trust

NOVA actions are checked through Agent Registry + Permission Registry. When approval is required, the Evidence Ledger records the authorization request before any consequential execution.

## Production boundary

This is a framework-neutral controller, not a deployed web server. A real OIDC adapter, PostgreSQL adapter/RLS, secure session storage, request validation, rate limiting, structured audit logging, and automated tests remain required before production/PHI use.
