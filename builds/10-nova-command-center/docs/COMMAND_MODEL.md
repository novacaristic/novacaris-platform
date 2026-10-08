# NOVA Command Model

Every command card follows:

SOURCE → FACTS → EVIDENCE → RISK → RECOMMENDATION → REQUIRED AUTHORIZATION → ACTION → VERIFICATION.

## Example

Source:
Compliance requirement.

Facts:
Required evidence is missing.

Evidence:
Current evidence inventory and expiration state.

Risk:
Readiness impact = high.

Recommendation:
Create corrective action and assign owner.

Authorization:
Human owner must approve assignment.

Action:
Create action request through the governed action system.

Verification:
Re-evaluate the requirement after evidence is submitted.

## Command classes

### Read
View dashboards, evidence, tasks, status and audit information.

### Investigate
Ask Mr. NOVA to explain a finding, summarize evidence or trace a dependency.

### Prepare
Draft a corrective action, note, communication, task or integration request.

### Authorize
Human approval routed into the existing policy/action framework.

### Execute
Only existing authorized tools execute the action.

### Verify
Confirm outcome and update readiness/evidence state.

No direct database mutation is exposed as a Command Center shortcut.
