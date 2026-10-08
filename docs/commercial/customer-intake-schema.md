# NOVA Customer Intake Schema

## Purpose

This is the first customer-facing data contract for the NOVA Readiness Check.

The intake captures enough context for Mr. NOVA to establish:

**Organization → Site → Service → Evidence → Assessment**

It intentionally does not treat a customer's self-reported answer as authoritative evidence.

---

## Organization intake

Required:
- organization ID
- organization name
- organization type
- jurisdiction(s)
- operating stage
- primary objective

Recommended:
- payer/program relationships
- funding objective
- technology/AI objective
- known compliance concerns

---

## Site intake

For each site:
- site ID
- site name
- jurisdiction
- address when appropriate
- license/authorization status
- linked evidence IDs

---

## Service intake

For each service:
- service ID
- site ID
- service name
- service category
- payer/program relationships
- linked evidence IDs

---

## Evidence

Evidence should be linked rather than copied into the intake record.

Evidence lifecycle:
- MISSING
- PRESENT
- STALE
- CONFLICTING
- HUMAN_REVIEW

Authoritative regulatory sources and source status remain separate from customer-provided evidence.

---

## Assessment generation

The intake engine performs:

1. structural validation
2. organization validation
3. site validation
4. service/site relationship validation
5. evidence presence checks
6. jurisdiction detection
7. regulatory review seeding
8. MPRIME review seeding where applicable
9. funding-objective review
10. technology/AI-governance review

The result is a set of structured findings consumed by the NOVA Readiness assessment engine.

---

## Human boundary

The intake engine does not:
- certify compliance
- declare regulatory approval
- submit Medicaid applications
- submit funding applications
- make clinical decisions
- execute consequential actions

Those actions require the appropriate source verification, permission, and human authorization boundaries.

---

## Next

The next implementation layer is the **assessment orchestrator**:

Provider Intake
→ Regulatory Graph
→ Evidence Ledger
→ MPRIME
→ Funding Scoring
→ Readiness Assessment
→ Academy Recommendations
→ Consulting Recommendations
→ Software Recommendations
→ Human Authorization where required
