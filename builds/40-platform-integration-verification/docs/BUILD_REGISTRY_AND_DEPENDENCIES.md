# Build Registry & Dependencies

Maintain a registry of each build with:
- stable build key
- repository path and revision
- ownership
- artifact status
- declared dependencies
- provided and consumed contracts
- migration references
- verification status

Dependencies should be explicit and reviewed for cycles, missing providers and incompatible versions. A repository folder alone does not prove that a service is deployed.
