# Temporal Memory Model

Organizational knowledge changes.

Every time-sensitive assertion should preserve:

- valid_from
- valid_to when known
- source
- confidence
- created_at

The graph should support questions such as:

- What was the policy on a given date?
- Which requirement was active when an action occurred?
- Which evidence supported a readiness assessment?
- What changed after a regulatory update?
- Which decision produced this corrective action?

Historical states remain queryable for audit reconstruction.
