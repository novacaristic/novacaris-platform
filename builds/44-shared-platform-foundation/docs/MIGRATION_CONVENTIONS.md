# Migration Conventions

Each migration should have a stable ID, owning build, checksum, dependencies, expected effect, compatibility notes, execution record and recovery plan.

Prefer expand-and-contract changes:
1. add backward-compatible schema/interface
2. deploy compatible consumers/producers
3. backfill and verify where needed
4. switch usage
5. remove old fields only after migration evidence

Build 40 tracks verification; Build 41 controls deployment. This document does not authorize direct production migrations.
