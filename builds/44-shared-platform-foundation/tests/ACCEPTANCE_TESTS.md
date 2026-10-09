# Build 44 Acceptance Tests

- [ ] Request context requires tenant, actor, request and correlation identifiers.
- [ ] Context is not treated as authentication or authorization proof.
- [ ] API success and error envelopes preserve request/correlation IDs.
- [ ] Error responses avoid sensitive implementation details.
- [ ] Events include version, tenant, actor and correlation references.
- [ ] Consumers define idempotency/retry behavior for side effects.
- [ ] Health status distinguishes degraded, unhealthy and unknown.
- [ ] Configuration/flags cannot override security controls.
- [ ] Migration conventions preserve compatibility and recovery plans.
- [ ] Logs are distinct from authoritative audit records.
- [ ] Contract version changes are checked for compatibility.
