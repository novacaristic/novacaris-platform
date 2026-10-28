# Build 65: NovaCarïs Compliance Intelligence (NCI), Intelligence Engine v1.0

Status: core engine, DRAFT. Not deployed. Not independently security-tested.

NCI helps operators organize and monitor compliance work for telehealth and other regulated healthcare services. It does **not** certify legal compliance, authorize prescribing, or replace qualified legal, clinical, pharmacy or regulatory review.

## What it does

Regulation → Requirement → Control → Evidence → Gap → Corrective action → Human approval → Audit trail

- **Three rails:** medical and regulatory operations, financial operations, acquisition and retention. Every requirement belongs to one.
- **Trust Layer rules (all enforced in code and tests):**
  - A regulatory source stays a draft until a named person approves it. A requirement from an unapproved or changed source is a gap (fail closed).
  - A control needs an owner. Evidence needs second-person approval; the submitter cannot approve it.
  - Evidence can expire; expired evidence reopens the gap.
  - A source change flags every affected requirement and control, and withdraws earlier conclusions until a person re-approves the source.
  - Corrective actions are proposed as drafts and cannot be closed until a person approves them and names an owner.
  - "Met" can only be recorded by a named person, with a note, and only when no gap is open.
  - Every action goes into a hash-chained audit trail; `verifyAuditChain` detects edits.

## Not built yet

AI interpretation of regulations; automatic regulatory feeds; database storage; user interface; multi-tenant isolation (one engine per tenant today); pharmacy, payment and EHR integrations; tamper-proofing beyond the in-memory hash chain; independent security testing. Do not put real patient records, prescriptions or payment-card data into anything built on this.

## Real regulatory content

None is included. The tests use clearly labeled SAMPLE data. Real requirements must be entered from approved primary sources and reviewed by qualified counsel.

## Run

```
npm run test:nci
npm run typecheck:nci
```

## Next

Persistence and tenant isolation (reuse Build 62 and 64 patterns), a review UI, then AI-assisted drafting of requirement mappings that always lands as a draft for human review.

## Relationship to the earlier MVP

An earlier Python/Flask MVP of NCI was described in a ChatGPT conversation. Its ZIP was not provided here, so this build does not reuse its code; it implements the engine layer the MVP listed as the next milestone.
