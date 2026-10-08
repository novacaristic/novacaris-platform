# Usage Model

Usage events should be:
- tenant-scoped
- measurable
- idempotent
- timestamped
- attributable to a feature
- safe to reconcile

Potential metered dimensions:
- agent tasks
- NovaClerk minutes
- document generation
- workflow executions
- API calls
- integration transactions
- Academy seats

Usage records should not contain unnecessary clinical or sensitive payloads.
