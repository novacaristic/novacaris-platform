# Subscription Lifecycle

TRIALING → ACTIVE → PAST_DUE → PAUSED → CANCELED

Alternative:
TRIALING → EXPIRED

Subscription state changes are recorded as events.

Commercial suspension should be implemented as an entitlement/service decision rather than destructive deletion.

Historical billing and subscription evidence remains retained according to applicable policy.
