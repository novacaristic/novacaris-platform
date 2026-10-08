# NovaCarïs Platform Manifest

## Canonical build chain

| Build | Capability | Depends on |
|---|---|---|
| 01 | Identity + Trust | — |
| 02 | Data + API | 01 |
| 03 | Mr. NOVA Runtime | 01, 02 |
| 04 | Voice / NovaClerk | 01, 02, 03 |
| 05 | Clinical Workflow | 01, 02, 03, 04 |
| 06 | EHR Integration | 01, 02, 03, 05, 08 |
| 07 | Intelligence + Memory + Evidence | 01, 02, 03 |
| 08 | Governance + Agent Control Plane | 01, 02, 03 |
| 09 | Evidence + Compliance OS | 01, 02, 07, 08 |
| 10 | NOVA Command Center | 01–09 |

## System principle

Regulation → AI interpretation → Evidence → Organizational readiness → Corrective action → Funding readiness → Human authorization → Audit trail.

## Global non-bypass rules

1. Identity is resolved before protected data access.
2. Tenant scope is mandatory.
3. Patient scope is explicit.
4. Agents cannot grant themselves permissions.
5. High-risk actions require authorization.
6. External EHR writes require policy approval and idempotency.
7. AI-generated clinical documentation remains draft until authorized human review/finalization.
8. Audit history is append-oriented and cannot be rewritten by the agent.
9. Compliance conclusions remain evidence-backed and explainable.
10. Unknown or conflicting conditions fail closed.

## Build 10 entry criteria

Build 10 may consume outputs from Builds 01–09 but may not create a second authorization system. The Command Center is an orchestration and visibility layer over the existing trust, policy, evidence and workflow controls.
