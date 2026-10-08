# Rollback Model

Rollback is a controlled recovery operation.

Trigger examples:
- failed required verification
- severe regression
- security defect
- unacceptable error rate
- critical integration failure
- failed migration

Rollback must identify:
- deployment being reversed
- target known-good release
- reason
- actor/automation
- verification result

Database rollback must never be assumed safe merely because application rollback is possible. Forward-fix may be required for irreversible schema changes.
