# Release & Rollback

Release workflow:
1. register exact model and configuration
2. classify the use case
3. complete required evaluations
4. complete security/privacy review
5. obtain accountable human approval
6. deploy through controlled release tooling
7. verify health and expected behavior
8. monitor and preserve release evidence

Rollback should identify the prior approved version, trigger, approver, timestamp and verification result. Emergency containment may disable a deployment under predefined policy while preserving audit evidence.
