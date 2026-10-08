# Closed-Loop Readiness v0.1

Customer workspace → evidence → Mr. NOVA assessment → readiness findings → action records → dashboard.

## Routes
- GET /api/health
- GET /api/workspace
- GET /api/assessments
- POST /api/assessments
- POST /api/evidence

The route contract is framework-neutral. A production HTTP adapter and real identity provider remain separate work.

## Assessment
The application service resolves organization-scoped intake and evidence, runs \`runNOVAAssessment()\`, persists assessment history, and hydrates the dashboard.

## Evidence trigger
\`reassessAfterEvidenceChange()\` persists evidence and immediately reruns the assessment in the same organization scope.

Evidence submission does not establish legal sufficiency, regulatory compliance, Medicaid approval, or funding eligibility.

## Action engine
Recommendations become durable action records with source finding, owner role, due date, status, evidence, verification note, and human-authorization requirements.

## Production boundary
Before PHI or consequential production actions: connect OIDC; use secure session IDs; implement PostgreSQL persistence/RLS; validate stored JSON; add access logging, retention, encryption, PHI controls; bind routes to an HTTP server; and add automated tests.
