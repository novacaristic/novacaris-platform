# Build 06 — EHR Integration

Vendor-neutral integration boundary for NovaCarïs and NovaClerk.

## Flow
NOVA WORKFLOW → INTEGRATION REQUEST → TRUST/POLICY → ADAPTER → EHR → CONFIRMATION → AUDIT

External writes require authenticated identity, tenant/subject scope, appropriate document state, required authorization, idempotency and adapter validation.

The adapter executes; it does not grant authorization or bypass NovaCarïs policy.
