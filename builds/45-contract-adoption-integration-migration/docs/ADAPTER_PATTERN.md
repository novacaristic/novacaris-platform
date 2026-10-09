# Adapter Pattern

Use a thin adapter to translate between a legacy module interface and the pinned Build 44 contract.

Adapter responsibilities:
- validate input shape
- map identifiers without changing their meaning
- propagate request and correlation IDs
- preserve tenant context while revalidating scope
- normalize errors without leaking sensitive details
- preserve idempotency semantics
- record safe diagnostic/audit references
- reject unsupported or ambiguous fields

Adapters must not create permissions, bypass policy, downgrade data classification or silently discard required fields.