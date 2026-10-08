# Credentials & OAuth

Credentials must be stored in managed secret infrastructure.

NovaCarïs database rows store references, not raw tokens or secrets.

Requirements:
- least-privilege scopes
- OAuth state/redirect validation where applicable
- token expiration/refresh handling
- revocation support
- credential rotation
- tenant ownership
- no secrets in prompts, logs or events

A valid credential does not imply permission for every connector capability.
