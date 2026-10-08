# Retry Policy

Retries are allowed only for operations that are safe to retry.

Each retry policy should define:
- maximum attempts
- delay/backoff
- retryable errors
- idempotency requirement
- escalation threshold

External side effects require idempotency protection.

A retry must never become an authorization bypass.
