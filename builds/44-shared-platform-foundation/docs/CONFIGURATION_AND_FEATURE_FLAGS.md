# Configuration & Feature Flags

Configuration must be schema-validated, environment-specific and versioned where behavior changes.

Feature flags:
- have a named owner and purpose
- default to the safest behavior
- cannot override security, privacy or authorization controls
- record changes and rollout scope
- support controlled disablement
- must not contain secrets

Flags that affect clinical, privacy or external side-effect behavior require explicit policy review.
