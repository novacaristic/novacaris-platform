# Branch Protection & Repository Settings

Recommended settings for `main`:
- require pull requests for changes
- require at least one independent review
- require selected validation and security checks
- dismiss stale approvals after material changes
- block force pushes and branch deletion
- require conversation resolution
- restrict production environment deployment to authorized reviewers
- limit GitHub Actions permissions to least privilege

Workflow files alone do not activate branch protection or environment reviewers. Configure those settings in repository administration and verify them with a test pull request.
