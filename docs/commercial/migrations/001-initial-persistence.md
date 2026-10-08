# Migration 001

This migration establishes the first persistent NovaCarïs customer data model.

## Organization isolation

The organization ID is present on customer-owned records and is intended to be derived from authenticated membership.

## Deliberate choices

- Foreign keys use ON DELETE RESTRICT to protect audit-relevant records.
- Assessment and evidence payloads are JSONB so the TypeScript domain model can evolve without premature column explosion.
- Production row-level security and database roles should be added before handling real customer data.
- No PHI should be stored until the production security architecture, encryption, retention, access logging, and applicable compliance controls are implemented.
