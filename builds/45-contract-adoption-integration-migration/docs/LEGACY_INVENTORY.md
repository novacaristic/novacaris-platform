# Legacy Interface Inventory

For every interface, record:
- stable item key
- producing and consuming builds
- current schema or payload reference
- authentication and tenant-scope behavior
- authorization boundary
- data classification
- retries, timeout and idempotency semantics
- failure handling and external side effects
- owner and criticality
- evidence of current behavior

Do not assume that all earlier build examples reflect the repository's current runtime implementation. Inspect actual source and record unknowns explicitly.
