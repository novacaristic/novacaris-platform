# Dependency Model

Steps may depend on previous steps.

Dependencies prevent:
- premature execution
- missing prerequisites
- contradictory sequencing

Dependency failures should produce visible blocked/failed states rather than silent skipping.

Circular dependencies should be rejected during workflow validation.
