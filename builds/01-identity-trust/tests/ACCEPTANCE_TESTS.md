# Build 01 Acceptance Tests

- [ ] No session → DENY.
- [ ] Expired session → DENY.
- [ ] Tenant mismatch → DENY.
- [ ] Inactive user → DENY.
- [ ] Missing required MFA → DENY.
- [ ] Unassigned patient → DENY.
- [ ] Active Privacy Hold → DENY for protected operation.
- [ ] Authorized assignment → ALLOW.
- [ ] Every decision creates an audit event.
- [ ] Audit records cannot be modified by the agent runtime.
