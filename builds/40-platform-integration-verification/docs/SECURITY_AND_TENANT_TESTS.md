# Security & Tenant Verification

Required scenarios include:
- unauthenticated requests fail closed
- cross-tenant reads and writes are denied
- agent/tool calls require policy authorization
- Privacy Hold blocks restricted access
- secrets are not emitted in logs
- webhook signatures and replay handling are verified
- exports require independent authorization
- audit events preserve actor, action, scope and outcome

Use synthetic data and isolated environments. Do not run destructive tests against production data without explicit authorization and an approved recovery plan.
