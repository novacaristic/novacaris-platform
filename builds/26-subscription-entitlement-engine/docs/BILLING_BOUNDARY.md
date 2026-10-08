# Billing Boundary

Build 26 records commercial state.

A payment processor may remain an external system.

NovaCarïs should store:
- external customer/reference ID
- subscription reference
- billing event reference
- commercial status
- reconciliation evidence

Do not store payment-card credentials in NovaCarïs operational tables.

Payment processor webhooks must be authenticated, idempotent and reconciled before changing entitlement state.
