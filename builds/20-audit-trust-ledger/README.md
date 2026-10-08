# Build 20 — NOVA Audit & Trust Ledger

Build 20 is the cross-system provenance and trust layer for NovaCarïs.

## Core question

For any consequential event, NovaCarïs must be able to answer:

WHO → DID WHAT → WHEN → UNDER WHAT AUTHORITY → USING WHICH EVIDENCE → UNDER WHICH POLICY → TO WHICH SUBJECT → WITH WHAT RESULT?

## Trust chain

IDENTITY → SESSION → AGENT → TOOL → POLICY → EVIDENCE → DECISION → AUTHORIZATION → EXECUTION → OUTCOME.

## Design goals

- append-oriented audit history
- tamper-evident event chaining
- correlation across builds
- actor and agent attribution
- policy and authorization references
- evidence provenance
- execution outcome
- verification outcome
- historical reconstruction

The ledger records what happened. It does not replace source-of-truth business tables.
