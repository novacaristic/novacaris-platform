# Build 02 API Contract

## Authentication
Every request carries a validated session established by Build 01.

## Core endpoints
GET /v1/patients/:id
GET /v1/patients/:id/encounters
POST /v1/encounters
GET /v1/encounters/:id
POST /v1/notes
PATCH /v1/notes/:id
POST /v1/tasks
PATCH /v1/tasks/:id

## Mutation requirements
POST/PATCH requests require:
- authenticated actor
- tenant resolved from session
- patient assignment when patient-scoped
- idempotency key for non-repeatable mutations
- audit event

Clinical note finalization is NOT an API shortcut. It is governed by Build 05 and Build 08.
