# NOVA Assessment Orchestrator

## Role

The Assessment Orchestrator is the bridge between customer intake and the NovaCarïs intelligence/control layers.

It coordinates existing engines rather than duplicating their logic.

## Pipeline

`Provider Intake → Validation → Regulatory Assessment → Evidence Usability → MPRIME → Funding Scoring → Readiness Assessment → Recommendations`

## Inputs

- Provider Intake
- Regulatory Graph
- Evidence Records
- Evidence States
- optional MPRIME provider profile
- optional Funding Opportunities
- optional Applicant Profile
- evaluation timestamp

## Outputs

A single assessment package containing:

- readiness assessment
- regulatory/compliance assessments
- MPRIME assessment
- funding scores
- usable evidence IDs
- intake validation result

The readiness assessment also contains recommendation routes for:

- Academy
- Consulting
- NovaCarïs software

## Recommendation policy

Recommendations are generated from findings and observed needs.

Examples:

- regulatory/evidence gap → Academy compliance training + NovaCompliance + compliance consulting
- MPRIME gap → MPRIME Lab + NOVA Readiness Check
- AI governance gap → AI Governance training + AI Transformation + Trust Layer
- funding opportunity → Funding Intelligence + NovaGrant
- operational/service gap → NovaCarïs Implementation + EHR/NovaClerk

Recommendations do not themselves authorize consequential actions.

## Trust boundary

The orchestrator is analytical.

It may produce:
- assessments
- recommendations
- action candidates
- human-review requirements

Execution remains behind the Agent Registry, Permission Registry, Human Authorization, and Evidence Ledger.

## Production boundary

The current implementation is a domain foundation.

Before production use:
- regulatory sources must be current and verified
- funding opportunities must be current and verified
- evidence provenance must be enforced
- scoring rules must be versioned
- access control and tenant isolation must be implemented
- human review workflows must be connected
- automated tests must cover denial, approval, conflicts, and end-to-end assessment scenarios
