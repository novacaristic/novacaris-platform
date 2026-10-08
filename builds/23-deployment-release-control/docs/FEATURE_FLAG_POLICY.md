# Feature Flag Policy

Feature flags permit controlled activation without requiring a new binary deployment.

Flags may be scoped by:
- environment
- tenant
- actor scope
- rollout percentage

Rules:
- default new features to disabled unless explicitly approved
- production flag changes are auditable
- sensitive or safety-critical behavior must not rely on an ungoverned flag
- flags require an owner
- obsolete flags should be retired

A feature flag is a release-control mechanism, not a substitute for authorization or security policy.
