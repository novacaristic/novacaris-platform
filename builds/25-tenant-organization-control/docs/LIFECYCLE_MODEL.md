# Tenant Lifecycle

PROVISIONING → ACTIVE → SUSPENDED → ACTIVE

or:

ACTIVE → DEACTIVATED

Suspension is reversible.

Deactivation is a controlled terminal business state and should preserve historical evidence.

Recommended suspension reasons:
- administrative
- billing
- security
- compliance
- requested closure
- operational pause

Deactivation should not mean destructive deletion of trust, audit or compliance history.
