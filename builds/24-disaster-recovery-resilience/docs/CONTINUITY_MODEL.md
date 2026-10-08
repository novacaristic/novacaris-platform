# Business Continuity Model

Continuity modes:

NORMAL
DEGRADED
READ_ONLY
MANUAL
EMERGENCY

Examples:
- EHR unavailable → preserve authorized work locally/queue safely where policy permits.
- External integration unavailable → do not claim successful external execution.
- Primary service degraded → restrict nonessential workloads.
- Critical dependency unavailable → activate defined manual/emergency procedures.

Continuity mode must never bypass Build 08 authorization or Build 21 privacy/security controls.
