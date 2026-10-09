# Database & Migration Audit

Review duplicate table names and ownership, migration naming/order, foreign-key and tenant-scope strategy, idempotency/replay behavior, index/constraint completeness, transaction boundaries, destructive changes and recovery plans, SQL dialect compatibility, and actual disposable/staging migration results.

A SQL file in the repository is not proof that a migration applies cleanly to a shared schema. Use controlled environments with suitable recovery plans.