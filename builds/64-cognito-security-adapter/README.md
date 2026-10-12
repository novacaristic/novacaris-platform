# Build 64 — Amazon Cognito Security Adapter

Status: implementation candidate. CI is not production approval.

## Implemented
- RS256 signature verification using Cognito User Pool JWKS.
- Exact HTTPS issuer, client ID, token_use=access, exp/nbf, subject, and tenant-claim checks.
- Cognito group-to-role mapping; unmapped roles deny.
- Role action allowlists; optional explicit token permissions can narrow, never elevate, role capabilities.
- PostgreSQL durable authorization-decision audit; audit failure denies the action.
- Tenant and actor context derives only from verified token claims, not caller-supplied tenant headers/body.

## Configuration
- COGNITO_ISSUER: exact HTTPS issuer, e.g. https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Example
- COGNITO_CLIENT_ID: Cognito app client ID
- NOVA_COGNITO_TENANT_CLAIM: optional trusted tenant claim; defaults to custom:tenant_id
- NOVA_COGNITO_GROUP_ADMIN / _SUPERVISOR / _OWNER / _CLINICIAN / _AGENT: exact group names (full variable names are NOVA_COGNITO_GROUP_ADMIN, NOVA_COGNITO_GROUP_SUPERVISOR, NOVA_COGNITO_GROUP_OWNER, NOVA_COGNITO_GROUP_CLINICIAN, NOVA_COGNITO_GROUP_AGENT)
- DATABASE_URL: PostgreSQL connection string; use dedicated least-privilege runtime user
- NOVA_DATABASE_SSL=true to enable verified PostgreSQL TLS
- NOVA_SECURITY_ADAPTER_MODULE: absolute path to this adapter file
- NOVA_ALLOWED_ORIGIN: exact origin; HTTPS outside local development

Apply sql/security-audit.sql using a migration identity before startup. Runtime database role must not own the audit table and should have only INSERT/SELECT privileges. Configure trusted tenant claims through Cognito's trusted provisioning/pre-token generation flow; never accept tenant IDs from request JSON or headers.

## Known gaps
- Tenant membership, agent ownership, agent registry lifecycle, parent-child delegation intersections, depth/fan-out/time/budget limits, and revocation are not yet implemented as a protected runtime registry. Agent principals intentionally have no capabilities.
- Review existing recovery route action names against this adapter's allowlist before enabling them; workspace policy actions are explicitly covered.
- MFA/step-up authentication requirements, token revocation/session refresh, rate limiting, JWKS rotation monitoring, host secrets, database TLS, and production monitoring require environment-level setup and review.
- Trigger-level append-only is not sufficient against DB owners/superusers. Separate schema/table ownership, grants, backup controls, and independent tamper monitoring are required.
- No real Cognito User Pool, hosted production DB, security assessment, penetration test, HIPAA/42 CFR Part 2 assessment, BAA, or production user flow has been tested.
- The existing fixed-actor demo adapter remains local-only and must not be used in a shared or production environment.