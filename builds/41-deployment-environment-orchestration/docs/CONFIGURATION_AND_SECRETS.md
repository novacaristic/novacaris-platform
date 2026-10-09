# Configuration & Secrets

Configuration should be schema-validated and environment-specific.

- store only secret-manager references in manifests
- never commit credentials, tokens, private keys or raw provider secrets
- inject secrets at runtime using least-privilege identity
- rotate secrets through approved procedures
- audit secret access
- fail closed when required configuration or secrets are missing
- prevent secret values from appearing in logs, prompts, test snapshots or build artifacts
