# Event Envelope

Platform events should include:
- unique event ID
- event type and version
- occurrence timestamp
- tenant reference where applicable
- actor reference
- correlation ID
- optional causation ID
- optional idempotency key
- payload conforming to a versioned schema

Consumers should deduplicate events where required, validate tenant scope, handle retries safely and preserve event provenance. Delivery attempts do not guarantee exactly-once processing.
