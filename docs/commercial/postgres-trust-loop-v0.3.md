# PostgreSQL Trust Loop v0.3

Authorization requests and Evidence Ledger entries now have application-level PostgreSQL persistence contracts and organization-scoped write methods.

## Flow

Mr. NOVA -> authorization request -> PostgreSQL authorization_requests -> human decision -> PostgreSQL status update -> Evidence Ledger event -> evidence_ledger_entries.

## Controls

- Every authorization request carries organization_id.
- Repository writes verify organization scope before SQL execution.
- PostgreSQL RLS remains the database enforcement boundary.
- Decisions only update PENDING requests.
- Ledger events are append-only at the application contract level.
- Cross-organization authorization updates are covered by the PostgreSQL RLS test.

This is persistence infrastructure, not a production security certification.
