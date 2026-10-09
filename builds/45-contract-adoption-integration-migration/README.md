# Build 45 — NOVA Contract Adoption & Integration Migration

Build 45 governs adoption of Build 44 shared contracts by existing NovaCarïs modules. It provides a migration inventory, compatibility mapping, adapter conventions, rollout gates and verification evidence.

## Core loop

DISCOVER LEGACY INTERFACE → MAP CONTRACT → BUILD ADAPTER → TEST COMPATIBILITY → PILOT → MIGRATE CONSUMERS → VERIFY → RETIRE LEGACY FORMAT.

## Scope

- legacy interface inventory
- producer/consumer mapping
- shared contract adoption records
- adapter and anti-corruption layer conventions
- compatibility and regression test plans
- migration waves and rollback conditions
- evidence and exception tracking
- legacy interface retirement criteria

## Guardrails

- Do not change every module simultaneously.
- Preserve existing authorization, privacy, clinical and audit authority.
- Do not infer adoption from a mapping document alone.
- External EHR writes remain subject to Builds 06 and 08.
- Tenant context is not proof of identity or authorization.
- Retire a legacy interface only after consumers are migrated and verified.

This build defines the migration framework; it does not claim that existing modules have already adopted the shared contracts.
