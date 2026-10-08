# Tenant Isolation Rules

1. Every protected request has tenant context.
2. Tenant context is server-derived or server-validated.
3. Cross-tenant queries require explicit privileged platform behavior.
4. Agents inherit tenant context; they cannot select arbitrary tenants.
5. Background jobs retain tenant scope.
6. Events retain tenant scope.
7. Integrations are owned by a tenant.
8. Tenant suspension blocks defined operational activity.
9. Deactivated tenants cannot execute ordinary workflows.
10. Audit and trust records remain attributable to their original tenant.

Cross-tenant administrative access must be separately authorized and auditable.
