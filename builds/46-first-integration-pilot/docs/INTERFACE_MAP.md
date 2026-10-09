# Pilot Interface Map

1. Caller supplies a request and server-authenticated RequestContext.
2. Build 44 validates required context fields.
3. Pilot verifies request tenant matches validated context tenant.
4. A policy adapter decides whether the operation is permitted.
5. An idempotency scope prevents repeated adapter execution within this in-memory pilot process.
6. A simulated adapter returns a downstream reference.
7. A versioned Build 44 event is recorded with tenant, actor and correlation references.
8. The result is returned to the caller.

Important limitation: RequestContext is not authentication. Production integration must derive it from validated server-side identity and membership checks. The in-memory idempotency map is for demonstration only; production requires durable, transactional deduplication.
