# NOVA Model Governance

Every production intelligence run records model provider, model name and version when available.

## Required controls

- prompt/input provenance
- retrieved context provenance
- output provenance
- confidence
- policy decision
- reviewer where required
- model/version metadata
- failure status

## Prohibited

- hidden external side effects
- untraceable recommendations
- fabricated evidence
- fabricated citations
- silent patient-context expansion
- self-authorized tool escalation

Model changes must be versioned and evaluated before production promotion.
