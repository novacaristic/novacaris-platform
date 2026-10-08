# Build 28 Acceptance Tests

- [ ] Workflow definitions are versioned.
- [ ] Published versions are immutable.
- [ ] Workflow instances retain tenant context.
- [ ] Dependencies determine step readiness.
- [ ] Circular dependencies are rejected during validation.
- [ ] Authorization is checked before consequential step execution.
- [ ] Unauthorized steps become blocked/escalated.
- [ ] Failed steps remain visible.
- [ ] Human approval can pause workflow progress.
- [ ] Evidence requirements can block completion.
- [ ] External side effects use idempotency.
- [ ] Retries do not bypass authorization.
- [ ] Resume re-evaluates prerequisites.
- [ ] Workflow events are auditable.
- [ ] Sensitive payloads are not unnecessarily copied into workflow logs.
