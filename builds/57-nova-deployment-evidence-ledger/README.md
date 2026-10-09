# Build 57 — NOVA Deployment Evidence Ledger & Release Gate

## Delivered
- Validates smoke-test reports rather than trusting a caller-supplied `result: passed` flag.
- Checks report schema, timestamps, run ID, configured base URL, check counts, and every individual check.
- Evaluates release eligibility against environment, full commit SHA, CI run URL, named human reviewer, explicit approval reference, and all-green smoke evidence.
- Persists evidence and eligibility to PostgreSQL with idempotent replay for environment + commit + smoke run.
- Requires human actor, authorization decision reference, and injected policy authorization to record evidence or approve a release.
- Approval requires an eligible ledger record and creates a separate append-only audit event. The ledger stores evidence/eligibility; approval is a separate authorized action.
- Append-only audit trigger prevents UPDATE/DELETE of audit rows.

## Migration and tests
Apply `sql/build_57_deployment_evidence.sql` through the reviewed migration process. CI runs release-gate unit tests and PostgreSQL-backed integration tests.

## Security and evidence boundaries
- This is a release-control primitive, not a deployment orchestrator and not proof a deployment occurred.
- Only reports from a trusted smoke-test runner should be submitted. A caller can fabricate JSON unless the host binds it to authenticated runner identity, signed artifacts, and a known deployed environment.
- Human reviewer identity and approval reference must be derived/validated by the host authorization system, not trusted from an arbitrary client body.
- Commit SHA must be supplied from trusted CI/deployment metadata.
- No automatic deployment, schema migration, production secrets, or live EHR actions occur.
- A successful gate indicates the submitted evidence meets this software's validation rules; it does not establish clinical safety, regulatory compliance, licensing approval, or correctness of external EHR data.
