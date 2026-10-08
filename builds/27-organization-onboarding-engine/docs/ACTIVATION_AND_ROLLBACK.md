# Activation & Rollback

Activation should be reversible when an onboarding configuration is materially incorrect.

If activation causes an unsafe or invalid configuration:
- stop affected workflows
- revoke inappropriate service activation
- preserve evidence
- restore known-good configuration
- record the decision/event
- require human review before reactivation

Activation rollback is not equivalent to deleting the organization.
