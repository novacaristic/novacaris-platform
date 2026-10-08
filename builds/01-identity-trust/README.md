# Build 01 — Identity + Trust

Foundation for NovaCarïs identity, tenant isolation, roles, patient assignment scope, Privacy Hold and audit requirements.

## Trust boundary
Every request resolves:
identity → tenant → role → subject scope → authorization → audit.

Mr. NOVA never receives unrestricted tenant access. Patient-scoped actions require an explicit patient assignment or an authorized exception.

## Acceptance
- Unauthenticated requests fail closed.
- Cross-tenant access is denied.
- A user cannot access an unassigned patient.
- Privacy Hold blocks protected workflows until an authorized release.
- Security-sensitive decisions create audit records.
