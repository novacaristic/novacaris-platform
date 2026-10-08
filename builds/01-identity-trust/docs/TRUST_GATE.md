# Trust Gate

Before any protected operation:

1. Validate session.
2. Validate tenant.
3. Validate user status and MFA where required.
4. Resolve role.
5. Resolve patient/subject.
6. Verify active assignment or explicit authorized scope.
7. Check Privacy Hold.
8. Evaluate requested operation.
9. Create audit event.
10. Permit or deny.

Default decision: DENY.

No downstream tool, agent or EHR adapter may bypass this gate.
