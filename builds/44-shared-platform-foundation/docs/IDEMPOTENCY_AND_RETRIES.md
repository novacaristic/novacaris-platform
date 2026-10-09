# Idempotency & Retries

For commands with side effects, define:
- operation scope
- idempotency key
- request fingerprint
- result reference
- replay behavior
- retention period
- conflict behavior

Retries are safe only when the operation contract supports them. Never blindly retry non-idempotent external writes. External EHR operations remain governed by Builds 06 and 08.
