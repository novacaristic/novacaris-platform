# Migration Execution

Before applying a migration:
- validate checksum and dependency order
- review schema impact and lock duration
- confirm backup/recovery strategy appropriate to the environment
- test against a disposable or staging database
- obtain environment-specific approval
- capture execution output and post-migration checks

Prefer forward recovery when rollback could destroy valid customer data. Never run destructive production migrations without explicit authorization and a tested recovery plan.
