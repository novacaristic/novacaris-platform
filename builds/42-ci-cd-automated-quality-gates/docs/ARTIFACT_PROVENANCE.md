# Artifact Provenance

Every release artifact should be associated with:
- source commit SHA
- build workflow run ID
- dependency lockfile
- build environment
- test/security report references
- immutable artifact digest
- build timestamp
- approval/change reference

Do not deploy a mutable tag alone. Verify that the digest being released matches the artifact that passed the required checks.
