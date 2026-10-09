# Build 59 — NOVA Deployment Attestation Service

## Purpose
Connects Build 57 release evidence to Build 58 Ed25519 attestations and human-controlled release approval.

## Service contract
- `submit(context, { ledgerId, requestId, attestation })`: requires an authenticated human actor, authorization decision reference, and `deployment.attestation.submit` policy decision. Loads tenant-scoped evidence, requires Build 57 eligibility, loads a currently active signer key from the registry, verifies signature and binds it to the exact environment, commit, smoke report and CI URL, then records the verified attestation and audit event transactionally. Invalid evidence is not persisted as verified.
- `approve(context, ledgerId, approvalReference)`: requires `deployment.release.approve` authorization, locks evidence and attestation, checks current key status, cryptographically verifies the stored signature again, checks the evidence remains eligible, then delegates the canonical human approval/audit operation to the Build 57 ledger.

## Migration order
1. Build 57: `build_57_deployment_evidence.sql`
2. Build 58: `build_58_signed_attestation.sql`
3. Build 59: `build_59_attestation_service.sql`

Provision public keys in `nova_deployment_attestation_keys` through a reviewed privileged key-management process. Keep private signing keys in a protected CI secret store/KMS only. Restrict database access to the signer registry. Revoked and expired keys are rejected at submission and approval.

## Security boundary and deployment notes
- Tenant scope is enforced on evidence and attestation lookups.
- Only verified attestations are stored by this service.
- This is a service module, not yet a public HTTP endpoint or fully enforced release pipeline. Production must restrict direct approval paths and route release approvals through this service.
- CI uses synthetic reports and ephemeral keys. No live deployment, production key, or actual customer release is certified by this build.
