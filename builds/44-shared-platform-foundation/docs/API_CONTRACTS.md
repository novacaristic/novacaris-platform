# API Contracts

Standard response envelopes:
- success: ok, requestId, correlationId, data
- failure: ok, requestId, correlationId, error code/message/retryability

Use stable machine-readable error codes. Do not return secrets, tokens, stack traces, protected payloads or internal policy details to clients.

Breaking changes require a new contract version or a documented compatibility window. Validate request and response schemas at service boundaries.
