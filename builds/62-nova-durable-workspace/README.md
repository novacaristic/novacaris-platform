# Build 62 — Durable Workspace + Local Runtime

## Goal
Demonstrate a complete synthetic note lifecycle using PostgreSQL: draft → submit → independent supervisor approval → durable audit history. Build 62 adds tenant-scoped PostgreSQL persistence, a transaction that writes each note transition and its audit event together, optimistic version checks, append-only audit protection, an API facade, and optional routing through the existing secure runtime.

## Local Windows demonstration
Prerequisites: Docker Desktop with the WSL 2 backend enabled, Git, and a terminal. From the repository root:

```powershell
docker compose up --build
```

Wait until the app starts and reports `nova_recovery_runtime_listening port=8080`. The API is at `http://localhost:8080`. This demo has no browser UI yet; use PowerShell requests below.

```powershell
$caseId = "62000000-0000-4000-8000-000000000062"
$headers = @{ Origin = "http://localhost:8080"; "Content-Type" = "application/json"; "x-demo-actor" = "clinician-demo" }
$body = @{
  caseId = $caseId
  source = "human"
  content = @{
    situation = "Client requested help with daily planning."
    intervention = "Reviewed a simple checklist and practiced using it."
    response = "Client engaged and selected one manageable action."
    plan = "Review checklist use and barriers at the next visit."
  }
} | ConvertTo-Json -Depth 5
$draft = Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/workspace/notes -Headers $headers -Body $body
$noteId = $draft.item.id
Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/workspace/notes/$noteId/submit" -Headers $headers -Body "{}"
$reviewHeaders = $headers.Clone(); $reviewHeaders["x-demo-actor"] = "supervisor-demo"
$review = @{ decision = "approve"; note = "Reviewed for completeness and follow-up clarity." } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/workspace/notes/$noteId/review" -Headers $reviewHeaders -Body $review
Invoke-RestMethod -Method Get -Uri "http://localhost:8080/api/workspace/notes/$noteId/audit" -Headers @{ "x-demo-actor" = "supervisor-demo" }
```

Expected lifecycle statuses: `draft`, `submitted_for_review`, `approved`. Audit history should contain `draft_created`, `submitted_for_review`, and `approved`. The note ID returned by the first request is used for later calls.

Stop the demo with `docker compose down`. To delete the local demonstration database as well, run `docker compose down -v` (destructive; deletes its data).

## API
- `POST /api/workspace/notes`: create a draft; body requires `caseId`, `source` and the four note sections.
- `POST /api/workspace/notes/:id/submit`: submit a complete draft for review.
- `POST /api/workspace/notes/:id/review`: independent supervisor/admin approval or request changes; requires decision and rationale.
- `GET /api/workspace/notes/:id/audit`: tenant-scoped audit history.

Identity is resolved server-side by the configured security adapter. The demo adapter maps fixed synthetic actor names to roles and always allows policy checks. This is deliberately insecure demonstration scaffolding and is only suitable for a developer's local machine. It is not production authentication/authorization.

## Verification
CI runs TypeScript checks and PostgreSQL-backed tests using the workflow's PostgreSQL 16 service. The integration tests verify durable reads from a separate store instance, independent approval, ordered audit events, audit immutability, and rollback if audit insertion fails. Docker Compose itself must be run on a machine with Docker Desktop to verify the end-to-end local launch.

## Controls and limits
- Tenant predicates are included in all note/case/audit reads and writes; a composite tenant/case foreign key prevents cross-tenant case linkage.
- Optimistic version checks reject stale note updates.
- Each note transition and audit append commit or roll back together.
- Database trigger blocks audit UPDATE/DELETE for ordinary SQL operations; production must additionally restrict table ownership/permissions and backups.
- The migration does not enable PostgreSQL Row Level Security. Tenant isolation depends on server-side predicates and trusted authorization; production RLS and separate DB roles should be evaluated.
- No live EHR, real patient database, connected LLM, identity provider, production authorization, encryption/key management, retention policy, BAA, security assessment, or customer acceptance test is included.
- Never enter real PHI into the demo. Do not expose its port to the internet. Change demo passwords and replace the adapter before any shared environment.
