# Mr. NOVA OpenAI staging checklist

This file is a setup checklist, not evidence of a deployed environment.

## Safe defaults
- Keep `NOVA_AGENT_FACTORY_ENABLED=false` until review and staging tests pass.
- Use OpenAI Responses API via `NOVA_AGENT_PROVIDER=openai`.
- The built-in adapter is text-only and has no external tools. External actions require a reviewed custom executor with an explicit tool allowlist and per-tool `invokeTool` authorization/audit checks.
- No staging credentials, model access, migrations, Cognito settings, or deployment have been verified by this repository change.

## Setup
1. Copy `.env.staging.example` into the deployment secret/configuration manager; do not commit real credentials.
2. Configure `DATABASE_URL`, `NOVA_SECURITY_ADAPTER_MODULE`, and `NOVA_ALLOWED_ORIGIN` for the staging environment.
3. Store `OPENAI_API_KEY` as a server-side secret. Set `OPENAI_MODEL` to a model confirmed enabled for that API project.
4. Review and apply both SQL migrations in a controlled staging database.
5. Run `npm run check:agent-factory` and `npm run check:pilot` in CI.
6. Verify Cognito issuer/client/claims, TLS, tenant isolation, permission revocation, human approval, and audit-failure behavior.
7. Run a budget-limited provider smoke test. Only then consider enabling the feature flag in staging.

## Go/no-go
- [ ] No secrets committed or exposed to clients/logs.
- [ ] Both migrations and schema readiness check pass.
- [ ] CI passes on the exact PR head.
- [ ] Tenant isolation and permission checks pass.
- [ ] High-risk actions require a non-self human approver.
- [ ] Pre-action audit failure blocks tool execution.
- [ ] OpenAI credentials and model access verified in staging.
- [ ] Spend limits, monitoring, rollback, and incident ownership documented.

Do not claim deployment until a real staging deployment and these checks are verified.