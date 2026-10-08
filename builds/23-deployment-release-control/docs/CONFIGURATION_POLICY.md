# Configuration Policy

Configuration is versioned separately from application code where appropriate.

Secrets must remain outside ordinary configuration records. Configuration records should reference managed secret/key identifiers rather than storing credentials.

Production configuration changes require:
- identifiable version
- approver when required
- checksum/reference
- deployment evidence
- audit event

Configuration drift should be detectable.
