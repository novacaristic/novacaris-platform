# Health Contract

Use distinct meanings:
- healthy: required dependencies are operating within defined thresholds
- degraded: service can operate with material limitations
- unhealthy: a required capability is unavailable or unsafe
- unknown: insufficient current evidence

Health endpoints must not disclose secrets, patient information or detailed infrastructure internals. Readiness checks should identify dependency status and observation time. A health response is not proof that every business workflow works.
