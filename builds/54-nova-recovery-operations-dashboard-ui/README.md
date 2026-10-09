# Build 54 — NOVA Recovery Operations Dashboard UI & API Integration

## Delivered
- A responsive standalone operator dashboard at `ui/index.html`.
- Live queue rendering, priority/status filters, summary counts, escalation detail, create, acknowledge, assign/reassign, and evidence-backed resolve actions.
- A framework-neutral TypeScript API facade with routes for queue, escalation lifecycle, and ambiguous-execution evidence review.
- API requests use same-origin credentials and display real server errors; the UI does not synthesize queue rows or claim actions succeeded before the API confirms them.
- Unit tests cover authentication gating, route dispatch, service delegation, error mapping, and malformed bodies.

## HTTP routes
- `GET /api/recovery/queue?status=executing|completed|reconciliation_required&limit=50`
- `GET /api/recovery/escalations?status=open|acknowledged|resolved&priority=normal|high|urgent&limit=50`
- `POST /api/recovery/escalations` — `executionId, priority, reason, assignedToActor?, dueAt?`
- `POST /api/recovery/escalations/:id/acknowledge`
- `POST /api/recovery/escalations/:id/assign` — `assignedToActor`
- `POST /api/recovery/escalations/:id/resolve` — `evidenceReference, note`
- `POST /api/recovery/executions/:id/review` — `disposition, evidenceReference, note`

## Security requirements for host integration
The facade intentionally accepts an injected server-side context resolver. The host must derive tenant and actor identity from a verified session/token, never from request body/query. Mount behind authentication and a real authorizer; add CSRF protection for cookie-based sessions, request-size limits, secure logging, rate limits, and origin controls. Use same-origin serving or a trusted API base URL. This build does not include an HTTP server, identity provider, production policy engine, deployment, or live EHR adapter.
