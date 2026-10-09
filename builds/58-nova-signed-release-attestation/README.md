# Build 58 — NOVA Evidence Provenance & Signed Release Attestation

## Delivered
- Ed25519 signature verification over canonical JSON attestation payloads.
- Binds evidence to environment, exact commit SHA, smoke-run ID, SHA-256 digest of the complete smoke report, CI run URL, and issue timestamp.
- Requires a trusted key ID and validates signature, payload binding, timestamp freshness (24-hour default), and future clock skew.
- Includes PostgreSQL schema for trusted signer keys, signed attestations, and append-only attestation audit events.

## Attestation production
A trusted CI/deployment runner must create the payload using `buildAttestationPayload`, sign `canonicalJson(payload)` with its protected Ed25519 private key, and submit the signature plus payload. Private keys must stay in CI key storage/KMS; never commit them or ship them to the UI. The verifier receives a trusted public-key map from reviewed configuration or a managed key registry.

## Verification and limitations
- Tests generate ephemeral keys and synthetic reports; they do not prove a production runner signed a real deployment.
- Trust anchors must be provisioned out-of-band and signer revocation/rotation operationalized. The SQL key table is a schema, not an automatic trust source; application code must only load active, in-validity keys from an authorized registry.
- The Build 57 release gate remains a separate primitive. Production release orchestration must require successful Build 58 verification before allowing approval/deployment; do not accept a client-provided `verified: true` flag.
- No production keys, live deployment, or EHR operation are included.
