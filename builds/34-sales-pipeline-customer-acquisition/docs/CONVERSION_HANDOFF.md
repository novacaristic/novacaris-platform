# Conversion & Handoff

A closed-won opportunity may create a downstream record such as:
- Build 33 consulting engagement
- Build 26 subscription onboarding request
- Build 32 Academy enrollment
- implementation workflow

Conversion should be idempotent and retain the source opportunity reference.

A sales-stage change alone should not silently provision a tenant, enable a paid service or execute a binding agreement.
