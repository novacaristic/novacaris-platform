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

## Also in this build

- **Persistence and tenant isolation:** `TenantRegistry` gives each tenant its own engine, refuses people who do not belong to the tenant, validates tenant ids, and reloads from snapshots only if the tenant matches and the audit chain is intact. `FileStore` is for local use. `PgStore` and `PgTenantRegistry` (`src/pg-store.ts`) store tenants in PostgreSQL using `sql/001_nci_schema.sql` (row-level security, append-only audit rows, locked transactions so simultaneous updates do not overwrite each other). Seven tests prove it on a real throwaway PostgreSQL 16: other tenants are invisible even if the app code is bypassed, no tenant set means no rows, audit rows cannot be edited or deleted, failures roll back. They run only when `NCI_PG_ADMIN_URL` and `NCI_PG_APP_URL` point at a throwaway database. Not yet tried on your real hosting (Supabase), and the app must connect as a non-owner role without BYPASSRLS.
- **AI drafting layer:** `draftProposals` takes an injected model, rejects any suggestion whose quoted source text is not actually in the source, and files the rest as pending proposals. Only a named person can accept one. No model is connected, and no network call is made.
- **Review page:** `renderReportHtml` makes a read-only page (rails summary, open gaps, items waiting for a person, audit trail with chain check). Try it: `tsx scripts/demo-seed.ts <dir>` then `tsx scripts/nci-report.ts demo-tenant <dir> 2026-11-01 > report.html`.

## Not built yet

A connected AI model and prompt design; automatic regulatory feeds; an interactive web interface with sign-in (the page is read-only); pharmacy, payment and EHR integrations; tamper-proofing beyond the hash chain; independent security testing. Do not put real patient records, prescriptions or payment-card data into anything built on this.

## Real regulatory content

None is included. The tests use clearly labeled SAMPLE data. Real requirements must be entered from approved primary sources and reviewed by qualified counsel.

## Run

```
npm run test:nci
npm run typecheck:nci
```

## Next

Try the Postgres store on your hosted database, add sign-in and approval buttons to the review page, connect a real model behind `DraftingModel`, and commission an independent security test.

## Relationship to the earlier MVP

An earlier Python/Flask MVP of NCI was described in a ChatGPT conversation. Its ZIP was not provided here, so this build does not reuse its code; it implements the engine layer the MVP listed as the next milestone.
