# Capability Scoping

Connector capabilities should be explicit and granular.

Examples:
- read patient demographics
- read encounter metadata
- draft document
- write approved document
- read payer eligibility
- read policy document
- send notification
- upload evidence artifact

Capabilities are declarations, not authorization grants. Build 08 and Build 21 determine whether a specific invocation is allowed.
