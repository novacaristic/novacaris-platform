# Test Layers

Report each layer separately:

1. Static artifact and schema review
2. Unit tests
3. API/contract tests
4. Integration tests with controlled dependencies
5. Database migration tests
6. Tenant isolation and authorization tests
7. End-to-end workflow tests
8. Staging smoke and recovery tests
9. Production verification, when explicitly authorized

A pass at one layer must not be reported as a pass at another layer. Each result should identify source revision, environment, runner and evidence.
