# Build 67 — Clinical Chart API + Screens

Three screens on top of Build 65 (chart tables) and Build 66 (row-level security), served by the Build 55 runtime at `/chart`:

- **Chart dashboard** — residents, Article 7 completeness (missing / overdue / needs signature), allergy banner.
- **Note writing** — draft, edit, sign (locks), supervisor cosign, signed addenda for corrections; AI drafts flagged.
- **MAR pass** — scheduled and PRN doses, required pre-assessments for PRN/first psychotropic and pain doses, refusals with reason, one-time effect/adverse-reaction follow-up.

Enable with `NOVA_CHART_ENABLED=true` (requires the security adapter's `resolveWorkspaceContext`). Optional `NOVA_DB_APP_ROLE` (default `nova_app`).

## Deploying safely
1. **Context secret.** Generate a random value of 32+ characters. Give it to the API as `NOVA_CONTEXT_SECRET`, and load it into the database once as the owner:
   `SELECT nova_set_context_secret('<same value>');`
2. **Dedicated database login.** Never connect the API as the owner, a superuser, `authenticator`, or anything that can become `authenticated`. Example:
   `CREATE ROLE nova_api LOGIN PASSWORD '<strong>' NOINHERIT; GRANT nova_app TO nova_api;`
   The API refuses to start on an unsafe login (`ChartApi.assertSafeConnection`).
3. **Staff roster.** Load `nova_staff_credentials` for each staff member: credential and rights to prescribe, verify orders, give medication, assist self-administration, and supervise. App users can read it but not change it.
4. **Agency rules.** Set `nova_chart_rules` (timezone, late-entry window, credentials whose notes need a cosign, TB window).

## Security model
- Identity comes only from the verified token; the Nova user is looked up by token subject inside the tenant.
- Each request is one transaction as `nova_app` with a short-lived HMAC-signed context (`app.ctx`) that the database verifies. Setting session variables by hand cannot impersonate anyone.
- The database, not the API, enforces authorship, signatures, locks, state transitions, MAR rules and staff rights, so the same rules hold for any client.
- Only whitelisted fields are accepted; tenant, patient, signer and timestamps are set server-side.
- Role permissions (Build 64): clinicians `chart.read`, `chart.note.write`, `chart.note.sign`, `chart.mar.administer`; supervisors/administrators also `chart.note.cosign`.

## Tests
`tests/chart-api.integration.test.ts` applies every build to the test database, drives the real HTTP server, and checks the restricted-login deployment and concurrent PRN doses (13 tests).
