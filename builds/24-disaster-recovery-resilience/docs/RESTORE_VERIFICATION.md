# Restore Verification

Restore validation should test:

1. backup integrity
2. schema/version compatibility
3. application startup
4. identity/authentication
5. authorization controls
6. tenant isolation
7. critical workflows
8. evidence and audit integrity
9. integration state
10. data reconciliation

A restore that starts but fails critical verification is not considered recovered.
