# Build 37 — NOVA Billing, Subscription & Revenue Operations Engine

Build 37 manages subscription lifecycle, commercial billing records, invoice status, payment-provider references, reconciliation and revenue reporting.

## Core loop

PLAN → SUBSCRIBE → ENTITLE → METER → INVOICE → COLLECT → RECONCILE → REPORT → RENEW/ADJUST.

## Scope

- product and service plans
- subscription records
- subscription items/add-ons
- metered usage records
- invoice records and line items
- payment-provider references
- payment status events
- credits and adjustments
- refund requests and outcomes
- failed-payment workflow references
- billing reconciliation
- revenue metrics
- commercial change history

## Security and authority boundaries

Billing status is not an authorization system. Build 26 governs commercial entitlements; Build 08 and Build 21 govern permissions and access. A failed payment must never grant or elevate access, and an unpaid invoice must not bypass security controls.

Payment credentials and card data must remain with a compliant payment provider. This build stores references and normalized status, not raw card data or secret payment tokens.
