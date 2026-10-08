# Release Model

Release lifecycle:

DRAFT → VALIDATED → APPROVED → DEPLOYING → DEPLOYED

Failure path:

DEPLOYING → FAILED → ROLLED_BACK

A release records its source revision and associated artifacts.

A release should not be promoted solely because the application starts successfully. Required validation gates must pass.
