# Audit Status Model

Use the strongest status supported by direct evidence:
- specified: design documentation exists
- committed: artifact exists at a recorded source revision
- static_reviewed: reviewer recorded a source/configuration review
- tested: named tests ran, with environment and results
- integrated: multiple components were exercised together
- staging_verified: staging checks passed
- production_verified: authorized production verification passed

Never infer a stronger status from file presence, test-file existence, or an unexecuted workflow.