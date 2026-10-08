# Build 26 — NOVA Subscription & Entitlement Engine

Build 26 defines the commercial entitlement layer for NovaCarïs.

## Core loop

PLAN → SUBSCRIBE → ENTITLE → USE → MEASURE → BILL/RECONCILE → UPGRADE/DOWNGRADE → RENEW/CANCEL.

## Purpose

Build 25 establishes who an organization is.

Build 26 establishes what that organization is commercially entitled to use.

The entitlement layer governs:
- plans
- subscriptions
- modules
- seats
- usage limits
- trials
- add-ons
- service activation
- subscription lifecycle
- usage measurement
- commercial suspension

## Initial plan model

The exact commercial prices remain configurable. The platform supports plan tiers such as:

- Starter
- Professional
- Enterprise

Plans should be versioned so future pricing changes do not rewrite historical subscription evidence.

## Important boundary

Billing status must not silently override:
- security controls
- privacy controls
- clinical safety controls
- authorization requirements
- Trust Ledger integrity
- regulatory evidence retention

A billing suspension can disable commercial services according to policy, but historical records and required audit evidence remain preserved.
