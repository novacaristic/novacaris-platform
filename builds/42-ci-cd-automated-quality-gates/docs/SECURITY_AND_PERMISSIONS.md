# Security & Permissions

- prefer read-only permissions by default
- scope write permissions to individual jobs
- pin third-party actions to reviewed immutable commit SHAs before high-assurance production use
- never expose secrets in logs or artifacts
- use protected environments and authorized reviewers
- do not grant pull-request code access to production secrets
- use least-privilege deployment identity and short-lived credentials where supported
- review dependency and action updates
- preserve test and release evidence

The included workflow examples are a starting point; production hardening and repository-specific validation are required.
