# Build 67 — Clinical Chart API + Screens

Three screens on top of Build 65 (chart tables) and Build 66 (row-level security), served by the Build 55 runtime at `/chart`:

- **Chart dashboard** — residents, Article 7 completeness (missing / overdue / needs signature), allergy banner.
- **Note writing** — draft, edit, sign (locks), supervisor cosign, signed addenda for corrections; AI drafts flagged.
- **MAR pass** — scheduled and PRN doses, required pre-assessments for PRN/first psychotropic and pain doses, refusals with reason, one-time effect/adverse-reaction follow-up.

Enable with `NOVA_CHART_ENABLED=true` (requires the security adapter's `resolveWorkspaceContext`). Optional `NOVA_DB_APP_ROLE` (default `nova_app`).

## Security model
- Identity comes only from the verified token; the Nova user is looked up by token subject inside the tenant.
- Each request is one transaction: `SET LOCAL ROLE nova_app` + tenant/user bound, so RLS and the chart triggers enforce isolation, self-signing and locking.
- Only whitelisted fields are accepted; tenant, patient, signer and timestamps are set server-side.
- Role permissions (Build 64): clinicians `chart.read`, `chart.note.write`, `chart.note.sign`, `chart.mar.administer`; supervisors/administrators also `chart.note.cosign`.

## Tests
`tests/chart-api.integration.test.ts` applies every build to the test database and drives the real HTTP server (9 tests).
