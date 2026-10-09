# Build 41 — NOVA Deployment & Environment Orchestration

Build 41 defines controlled deployment workflows for NovaCarïs across development, staging and production environments.

## Core loop

SOURCE REVISION → BUILD → STATIC VALIDATION → TESTS → PACKAGE → STAGING → APPROVAL → DEPLOY → HEALTH CHECKS → VERIFY/ROLL BACK.

## Scope

- environment and release manifest definitions
- build artifact provenance
- configuration validation
- migration preflight and execution records
- CI workflow expectations
- deployment approval gates
- secret references and environment separation
- health and smoke checks
- deployment history and evidence
- rollback/forward-recovery records
- post-deployment verification
- release audit events

## Safety boundaries

This build defines orchestration contracts and reference logic. It does not create cloud infrastructure, configure real secrets, deploy services, or prove a live environment exists.

Production deployment must require an approved source revision, required checks, migration plan, accountable approval, and a documented recovery path. Secrets must be injected through an approved secret manager and never committed to the repository.
