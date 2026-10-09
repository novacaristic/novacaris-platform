# Build 46 Acceptance Tests

- [ ] Uses only synthetic fixtures and a simulated downstream adapter.
- [ ] Context validation is applied at the entry point.
- [ ] Tenant mismatch blocks before policy and adapter execution.
- [ ] Policy denial blocks downstream side effects.
- [ ] Successful requests emit a versioned correlated event.
- [ ] Duplicate idempotency keys do not repeat adapter execution in the pilot process.
- [ ] Adapter/event failures return explicit non-success outcomes.
- [ ] Evidence report captures source revision and environment.
- [ ] Production use is blocked until durable idempotency, server-side identity, transactional/reconciliation design and independent security review exist.
- [ ] No claim of live integration or successful execution without actual run evidence.
