# Contract Migration Test Plan

For each adoption item test:
- valid payload compatibility
- missing/unknown fields
- contract version mismatch
- tenant boundary violations
- unauthenticated and unauthorized requests
- correlation propagation
- error mapping and sensitive-detail redaction
- duplicate request/event handling
- timeout/retry behavior
- producer/consumer regression
- rollback or compatibility fallback
- evidence and audit linkage

Run tests in isolated environments with synthetic fixtures. Record exact revision, environment, command, result and evidence reference.