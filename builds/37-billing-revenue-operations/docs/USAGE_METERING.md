# Usage Metering

Usage records should include:
- tenant
- metric key
- quantity and unit
- occurrence time
- source reference
- idempotency key
- rating state

Usage ingestion must be deduplicated and traceable. The system should not charge for unverified or duplicated usage events.
