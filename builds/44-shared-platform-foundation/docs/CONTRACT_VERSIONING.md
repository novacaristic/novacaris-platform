# Contract Versioning

Use explicit contract versions and compatibility checks.

- additive optional fields may be compatible if consumers tolerate unknown fields
- renaming/removing required fields is breaking
- changing event meaning is breaking even if the schema shape is unchanged
- consumers should declare supported versions
- deprecation requires notice, usage evidence and a migration plan

Build 40 should verify producer/consumer compatibility. CI should reject known breaking changes without an approved migration plan.
