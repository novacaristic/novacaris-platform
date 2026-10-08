# Build 29 — NOVA Document & Form Engine

Build 29 provides the governed document, form and artifact layer for NovaCarïs workflows.

## Core loop

TEMPLATE → COLLECT → GENERATE → REVIEW → APPROVE → SIGN/FINALIZE → STORE → EVIDENCE → AUDIT.

## Scope

- document templates
- structured forms
- document versions
- generated documents
- field values
- review workflows
- approvals
- signatures
- evidence packets
- document status
- retention references
- export references
- provenance

## Design principle

AI-generated content is a draft until the required human review and authorization path is satisfied.

Mr. NOVA may prepare a document, populate a form from authorized data, identify missing fields and recommend edits. It must not silently represent a draft as an approved or signed organizational record.

## Security

Build 21 remains authoritative for privacy and access.
Build 08 remains authoritative for agent/tool permissions.
Build 19 governs consequential human decisions.
Build 20 records material document lifecycle events.
