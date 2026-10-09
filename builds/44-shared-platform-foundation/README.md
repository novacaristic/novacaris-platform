# Build 44 — NOVA Shared Platform Foundation

Build 44 defines shared contracts and conventions used across NovaCarïs modules so independently developed builds can interoperate consistently.

## Core contract domains

- tenant and organization context
- actor/session identity references
- authorization decision references
- API response and error envelopes
- event envelopes and correlation identifiers
- idempotency keys
- configuration and feature flags
- health/readiness contracts
- migration metadata
- structured logs and audit references
- contract version compatibility

## Design principle

This build defines a common contract layer. It does not replace the authoritative identity, authorization, privacy, audit, billing, clinical or deployment services owned by other builds. Shared context carries references to decisions made by those authorities; it must not manufacture authority.

## Adoption strategy

1. Pin the contract version used by each module.
2. Add adapters around existing module-specific interfaces.
3. Validate compatibility in CI.
4. Migrate one integration at a time.
5. Remove legacy formats only after consumers have migrated and tests pass.

No platform-wide migration should be inferred from adding these contracts alone.
