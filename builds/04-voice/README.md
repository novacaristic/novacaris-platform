# Build 04 — Voice

Controlled voice-to-workflow layer for Mr. NOVA/NovaClerk.

Voice is an input channel, not an authorization bypass.

## Pipeline
VOICE SESSION → AUTHENTICATED USER → ENCOUNTER CONTEXT → TRANSCRIPT → EXTRACTION → DRAFT → REVIEW.

The system binds a recording/transcript to a known user and encounter. Extracted clinical content remains draft until human review and finalization.
