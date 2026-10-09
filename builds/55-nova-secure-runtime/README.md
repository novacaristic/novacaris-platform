# Build 55 — NOVA Secure Deployment & Runtime Integration

## Delivered
- Node HTTP runtime serving the Build 54 dashboard and routing API requests to the governed API facade.
- Liveness endpoint at `GET /healthz` and database-backed readiness endpoint at `GET /readyz` (503 when readiness is not configured or the PostgreSQL probe fails).
- Same-origin checks on POST, JSON content-type enforcement, bounded JSON body size (64 KiB), method allow-list, and baseline security headers.
- Startup bootstrap requires `DATABASE_URL` and a trusted host security adapter module. Startup fails closed if either is absent or the adapter contract is incomplete.
- Adapter contract must export `resolveContext(request)`, which derives tenant and actor from a verified server-side session/token, and `authorize(context, action)`, which applies the real policy engine.
- Graceful shutdown closes HTTP server and PostgreSQL pool.

## Required environment
- `DATABASE_URL`: PostgreSQL connection string supplied via secret manager.
- `NOVA_SECURITY_ADAPTER_MODULE`: absolute filesystem path to a trusted, reviewed ESM module exporting `resolveContext` and `authorize`.
- `PORT`: optional, defaults to 8080.
- `HOST`: optional, defaults to 0.0.0.0; restrict with deployment/network policy as appropriate.
- `NOVA_ALLOWED_ORIGIN`: required exact HTTP(S) browser origin, validated before startup. Use HTTPS outside local development.
- `DB_POOL_MAX`: optional pool size, defaults to 10.

## Run
Build/transpile with the repository TypeScript toolchain, set the required environment, then run the emitted `builds/55-nova-secure-runtime/src/main.js` with Node. Apply reviewed migrations (Builds 46, 50, 51, 52, 53) before serving the API. Do not auto-apply schema migrations during application startup.

## Security boundary
No default authentication, authorization allow-all, database credentials, or production adapter are included. The host security adapter is mandatory. The API context must never be populated from user-controlled query/body fields. Put the service behind TLS and an appropriately configured ingress; use a verified identity provider, CSRF protection for cookie sessions, rate limits, request logging with PHI/secret redaction, and secrets management before production. Health endpoint currently reports process liveness only, not database readiness. No production deployment or live EHR connection is claimed.
