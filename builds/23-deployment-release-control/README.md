# Build 23 — NOVA Deployment, Environment & Release Control Plane

Build 23 governs how NovaCarïs changes move from development to controlled production operation.

## Core loop

CHANGE → VALIDATE → REVIEW → AUTHORIZE → PROMOTE → VERIFY → OBSERVE → ROLLBACK/RETAIN.

## Scope

- environment separation
- release manifests
- deployment approvals
- migration tracking
- configuration versioning
- feature flags
- rollout controls
- rollback plans
- release verification
- deployment evidence
- change traceability

## Environment model

DEVELOPMENT → STAGING → PRODUCTION

Production promotion requires evidence that the release passed its defined validation gates.

## Trust principle

A deployment is not complete merely because code was copied to a server. NovaCarïs must be able to prove what version was deployed, by whom, under what approval, with which configuration and migration state, and whether the release remained healthy afterward.
