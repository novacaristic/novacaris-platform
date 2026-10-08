# NOVA Customer Portal

## Purpose
The NOVA Customer Portal is the customer-facing operating surface for NovaCarïs Consulting, Academy, intelligence and software workflows.

It gives an organization one place to understand:
- where it stands
- what applies to it
- missing evidence
- priority findings
- Mr. NOVA recommendations
- human-review items
- Academy training
- Consulting services
- NovaCarïs software
- open and completed actions

## Dashboard
- overall readiness score
- readiness status
- assessment date and rule version
- domain scores
- priority findings
- action queue
- Academy recommendations
- Consulting recommendations
- software recommendations
- human-review count

## Customer workflow
Sign in → Organization → Sites/Services → Intake → Evidence → Assessment → Dashboard → Action Queue → Verification

## Roles
OWNER, ADMIN, COMPLIANCE, OPERATIONS, CLINICAL, FINANCE, VIEWER

Role enforcement belongs to the identity/access layer and must not be inferred from UI state.

## Tenant boundary
Every workspace is keyed by organization ID. Production implementation must enforce authenticated identity, organization membership, role authorization, resource authorization, site/service scope where required, audit events, and no cross-tenant access.

## Human authorization
The portal can display actions requiring human authorization, but a recommendation never equals approval. Authorized execution remains behind Agent Registry, Permission Registry, Human Authorization, and Evidence Ledger.

## Initial API contract
CustomerWorkspace, CustomerDashboard, PortalFinding, PortalAction.

Future API operations:
- get workspace
- get latest dashboard
- get assessment history
- get findings
- get actions
- update intake
- attach evidence
- request human review
- record authorized completion

## UI implementation
1. Executive Dashboard
2. Readiness
3. Findings
4. Action Queue
5. Evidence
6. Sites & Services
7. Academy
8. Consulting
9. Funding
10. AI Governance
11. Assessment History
12. Organization Settings

## Product principle
The dashboard should be useful by itself. Products are recommended from demonstrated needs rather than artificial bundling.