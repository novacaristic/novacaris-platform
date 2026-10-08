# PostgreSQL Persistence Model v0.1

## Core tables

- organizations
- organization_members
- workspaces
- provider_intakes
- assessments
- assessment_findings
- evidence_records

## Isolation

Every customer-owned record carries organization_id. Application services must obtain organization_id from the authenticated session rather than from an untrusted client field.

## Trust boundary

Database persistence does not grant permission to execute consequential actions. Agent Registry, Permission Registry, Human Authorization, and Evidence Ledger remain separate controls.

## Migration policy

Schema changes must be versioned. No production connection strings, credentials, PHI, or secrets belong in the repository.
