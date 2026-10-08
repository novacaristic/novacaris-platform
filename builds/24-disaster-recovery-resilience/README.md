# Build 24 — NOVA Disaster Recovery, Business Continuity & Resilience Engine

Build 24 governs NovaCarïs recovery when ordinary reliability controls are insufficient.

## Core loop

PREPARE → BACK UP → DETECT → DECLARE → CONTINUE → RESTORE → VERIFY → RECONCILE → LEARN.

## Scope

- backup policy
- backup execution evidence
- restore testing
- RTO/RPO targets
- disaster declarations
- business continuity modes
- dependency-loss handling
- recovery plans
- recovery verification
- reconciliation
- disaster exercises
- resilience evidence

## Resilience principle

A backup is not proof of recoverability.

NovaCarïs treats recoverability as a verified capability: backups must be identifiable, restoration must be testable, recovered state must be validated, and continuity decisions must remain auditable.

## Relationship to previous builds

Build 22 detects reliability degradation.
Build 23 controls releases and rollback.
Build 24 handles larger-scale service disruption and recovery.

Build 20 remains the trust record for material recovery events.
Build 21 remains the security/privacy boundary during recovery.
