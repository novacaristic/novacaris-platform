# Build 61 — Mr. NOVA Client/Case Workspace

## Purpose
A narrow executable workflow for a controlled behavioral-health documentation pilot: select an active tenant-scoped case, create a human or AI-assisted draft, check required note sections, submit for independent supervisor review, request changes or approve, and retain workflow audit events.

## Workflow and controls
1. Require server-verified human context and a policy decision reference for every operation.
2. Check Situation, Intervention, Response, and Plan for completeness. This check does not determine clinical correctness, medical necessity, billing eligibility, or regulatory compliance.
3. AI-assisted drafts remain drafts and cannot bypass human review.
4. Submission requires all four sections to contain at least eight characters.
5. Approval requires supervisor/administrator role, a written review rationale, and a reviewer different from the author.
6. Store calls are tenant-scoped. The host must enforce tenant isolation in production persistence too.

## Verification
Vitest covers draft creation/audit evidence, incomplete-section blocking, tenant isolation, policy denial, human-actor enforcement, supervisor role enforcement, self-approval prevention, state transitions, and independent approval.

## Explicit limitations
- Tests use an in-memory store and synthetic, non-identifying data.
- No live EHR, patient database, LLM provider, identity provider, or production authorization service is connected.
- Replace the test store with durable transactional persistence. Production note save and audit append must be atomic; enforce audit immutability using database permissions/triggers.
- Optimistic concurrency, encryption/key management, retention rules, signed audit exports, deployment, security assessment, BAA review, and customer acceptance testing remain required before production or PHI use.
- The ai_assisted source flag demonstrates a human-review boundary; it does not claim an AI integration is connected.
- This is not an EHR, diagnosis engine, or billing/medical-necessity determination.

## Local verification
Run npm run typecheck:pilot and npm run test:pilot after installing dependencies and configuring the PostgreSQL test service.
