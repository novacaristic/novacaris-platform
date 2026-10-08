# Command Center Security Model

The Command Center is a presentation and orchestration layer.

It trusts no client-provided:
- tenant_id
- patient_id
- role
- permission
- risk level
- authorization status

Those values are resolved or verified server-side.

## Required chain

Build 01 identity
→ Build 08 policy
→ Build 10 command
→ governed action request
→ appropriate execution subsystem
→ audit.

A dashboard control cannot manufacture authorization.

## Sensitive data
Use minimum necessary data. Patient-sensitive information is shown only when the authenticated actor has appropriate scope.
