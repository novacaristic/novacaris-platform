# Build 46 — NOVA First Integration Pilot

Build 46 defines a bounded, low-risk pilot to prove that the shared contracts, policy gates, events and audit references can work together. The initial pilot uses synthetic data and a simulated downstream adapter. It does not connect to a live EHR, process real patient data, charge a customer or deploy production changes.

## Pilot scenario

A synthetic operational request is submitted with tenant and actor context, validated against a pinned shared contract, evaluated by a policy-gate interface, sent through an idempotent simulated adapter, and recorded as a correlated outcome.

## Workflow

REQUEST → VALIDATE CONTEXT → CHECK POLICY → DEDUPLICATE → SIMULATED ADAPTER → RECORD EVENT → VERIFY RESULT.

## Deliverables

- pilot scope and explicit exclusions
- interface map and contract references
- synthetic fixture format
- TypeScript pilot orchestrator
- adapter and policy interfaces
- idempotency contract
- test cases for allow, deny, duplicate and failure paths
- evidence/report template
- controlled promotion checklist

## Status boundary

This repository build supplies a runnable reference design and test code. It is not evidence that a live external service is connected or that the pilot has run in CI/staging. Record actual commands, revision and test output before marking it executed.
