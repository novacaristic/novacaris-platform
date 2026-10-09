# Workflow Catalog

- `.github/workflows/validate.yml`: repository structure and whitespace validation.
- `.github/workflows/typescript-tests.yml`: runs configured tests only when a root package manifest and lockfile are present; otherwise explicitly reports missing test setup.
- `.github/workflows/security-scan.yml`: configured secret-pattern scan and CodeQL analysis.
- `.github/workflows/release-gate.yml`: manually invoked release preflight requiring exact source revision, artifact digest and change reference. It does not deploy.

Review all workflow permissions, action versions, repository settings and organization policy before enabling these workflows as required branch checks.
