# Build 42 — NOVA CI/CD Pipeline & Automated Quality Gates

Build 42 defines repository automation for validating changes and preparing controlled release artifacts.

## Core loop

PULL REQUEST → VALIDATE → TEST → SCAN → PACKAGE → PUBLISH EVIDENCE → STAGING GATE → APPROVAL → RELEASE.

## Scope

- GitHub Actions workflow templates
- pull-request quality gates
- TypeScript static checks and tests
- SQL migration validation hooks
- dependency and secret scanning
- artifact metadata and digest
- test report retention
- staging/production environment protection
- release provenance
- failure notification hooks
- reusable workflow conventions

## Important status distinction

The workflow files in this build are repository artifacts. They must be reviewed against the repository's actual package scripts, test runner, SQL tooling, branch protections, secrets and environment configuration before enabling required checks or production deployment.

This build must not deploy to production automatically. Production deployment requires a protected environment and accountable approval.
