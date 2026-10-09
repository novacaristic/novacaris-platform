# Rollback & Recovery

A recovery plan must specify:
- trigger conditions
- accountable decision-maker
- prior known-good artifact
- database compatibility constraints
- recovery steps
- customer/data impact
- post-recovery verification
- evidence and event references

Application rollback may not reverse database changes safely. Use tested forward-recovery procedures when data transformations are not reversible.
