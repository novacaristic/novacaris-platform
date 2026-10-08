# Clinical Note State Machine

DRAFT → IN_REVIEW:
Allowed by author or Mr. NOVA when required fields are present.

IN_REVIEW → APPROVED:
Requires authorized human reviewer and passing required quality gates.

APPROVED → FINAL:
Requires finalization authority under tenant policy.

IN_REVIEW → REJECTED:
Reviewer rejects with reason.

FINAL:
Immutable from the AI runtime. Corrections create an explicit correction/addendum workflow; silent mutation is prohibited.
