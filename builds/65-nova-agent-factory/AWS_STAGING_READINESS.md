# Mr. NOVA — AWS Staging Readiness Worksheet

Status: NOT YET VERIFIED against a live AWS staging account. This worksheet separates repository/CI evidence from infrastructure evidence. Do not enable the agent feature flag until every required gate is evidenced.

## 0. Guardrails
- Keep NOVA_AGENT_FACTORY_ENABLED=false until all gates pass.
- Never paste credentials, secret values, database URLs, tokens, or sensitive account output into chat, logs, screenshots, or Git.
- Use a dedicated staging environment and least-privilege operator access.
- Do not run SQL migrations against production. Confirm AWS account, region, and database endpoint before any change.
- The built-in OpenAI adapter is text-only and has no external tools. Do not attach side-effecting integrations during the first smoke test.

## 1. Inventory existing staging resources (read-only first)
In AWS Console, select the intended staging account and region. Record resource identifiers—not secret values—for:
- Runtime host/service for the Node.js secure runtime.
- RDS/Aurora PostgreSQL resource and staging database name.
- Cognito user pool and app client.
- Secrets Manager secrets or Parameter Store parameters used by the runtime.
- CloudWatch log group, alarms, and deployment/rollback mechanism.
- Network path between runtime and database; security groups should allow only required traffic.

Evidence required: account alias or last four account digits, region, runtime service name, database resource identifier, user-pool ID, and screenshots/links with secret values hidden. If a component is missing, mark it missing rather than creating infrastructure by guess.

## 2. Verify database safely
- Confirm staging PostgreSQL is private, encrypted at rest, and reachable only from the runtime/security group or approved admin path.
- Confirm TLS is required for application connections and backups/point-in-time recovery are enabled.
- Use the approved migration process to inspect and apply both Build 65 SQL migrations to staging only.
- Verify the runtime's schema readiness predicate: nova_agents.agent_profiles, nova_agents.agent_permissions, and nova_agents.tasks columns idempotency_key and approved_by.
- Run npm run check:agent-factory and npm run check:pilot against the exact repository revision intended for staging.

Pass evidence: migration file names and successful output with connection strings, usernames, and secrets redacted; readiness check passes; CI passes on the exact commit.

## 3. Verify Cognito and security adapter
- Identify the reviewed Cognito adapter module packaged with the runtime; NOVA_SECURITY_ADAPTER_MODULE must be an absolute path valid inside the deployed runtime.
- Verify issuer, audience/client ID, token signature, expiry, and expected claims validation; confirm group/role/action mappings are least-privilege.
- Verify tenant and actor identifiers come only from verified server-side identity context, never request body fields.
- Test missing/invalid/expired tokens, wrong audience, missing required claims, cross-tenant requests, and revoked permissions; each must deny by default.
- Confirm HTTPS/TLS and exact allowed origin in NOVA_ALLOWED_ORIGIN.

Pass evidence: redacted configuration names and test results; no token values or personal data.

## 4. Configure secrets server-side
Use AWS Secrets Manager (preferred) or the approved secret store. Inject secrets only into the server runtime with a narrowly scoped IAM role:
- OPENAI_API_KEY: staging project key, never a browser/client variable.
- DATABASE_URL: staging-only TLS connection string.
- Any Cognito/security adapter settings required by the reviewed adapter.

Set non-secret runtime configuration:
- NODE_ENV=staging
- NOVA_AGENT_PROVIDER=openai
- OPENAI_MODEL: exact model identifier confirmed enabled for the API project
- NOVA_OPENAI_MAX_STEPS=6
- NOVA_OPENAI_MAX_OUTPUT_TOKENS=1200
- NOVA_AGENT_FACTORY_ENABLED=false during preflight
- NOVA_ALLOWED_ORIGIN: exact HTTPS staging origin

Do not put secret values in GitHub Actions YAML, committed .env files, container images, build arguments, client-side bundles, or logs. Restrict secret-read permissions to the runtime role and designated operators. Confirm rotation and revocation procedure.

## 5. Preflight gates before enabling the flag
- [ ] CI passed on the exact PR head and independent review is complete.
- [ ] Both Build 65 migrations applied in staging; schema readiness passes.
- [ ] Runtime starts with feature flag off and health/readiness checks pass.
- [ ] Cognito authentication and authorization denial tests pass.
- [ ] Tenant isolation, permission revocation, idempotency, and non-self human approval tests pass.
- [ ] Simulated audit-write failure blocks the side effect.
- [ ] CloudWatch logs redact secrets and sensitive request/response data; alarms and an owner are defined.
- [ ] OpenAI key and chosen model are verified with a budget-limited text-only staging smoke test.
- [ ] Provider usage/spend limit, request timeout, rollback procedure, and incident owner are documented.

## 6. Controlled staging smoke test
Only after all preflight items pass, enable the flag for staging only. Deploy the reviewed PR head, verify startup and schema readiness, submit a harmless text-only task with no external tools, confirm task status/audit evidence, and check spend/latency/error telemetry. Then disable the flag and verify the service returns to prior safe behavior. Do not use real client records or PHI.

Rollback: set NOVA_AGENT_FACTORY_ENABLED=false, redeploy/restart staging using the approved mechanism, verify the worker is not processing agent tasks, preserve audit/log evidence, and investigate before retrying.

## Current repository evidence (not AWS evidence)
- PR: https://github.com/novacaristic/novacaris-platform/pull/13
- Staging template: builds/65-nova-agent-factory/.env.staging.example
- OpenAI runbook: builds/65-nova-agent-factory/STAGING_OPENAI_RUNBOOK.md
- The latest known workflow run succeeded, but this does not prove AWS resources, credentials, migrations, Cognito configuration, or deployment are ready.
