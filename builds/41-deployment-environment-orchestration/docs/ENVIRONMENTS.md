# Environment Model

Use separate environments with distinct configuration and credentials:
- development: fast iteration with synthetic data
- staging: production-like verification with controlled test data
- production: approved customer workloads

Do not copy production secrets into lower environments. Prefer synthetic or appropriately de-identified test fixtures. Environment promotion should preserve the exact artifact digest and source revision.
