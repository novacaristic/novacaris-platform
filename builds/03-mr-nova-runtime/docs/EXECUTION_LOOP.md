# Mr. NOVA Execution Loop

1. Authenticate actor.
2. Resolve tenant and subject scope.
3. Create task.
4. Classify requested operation.
5. Select only permitted tools.
6. Evaluate policy.
7. Determine risk and approval requirement.
8. Create execution envelope.
9. Execute tool with bounded input.
10. Validate result.
11. Produce draft/recommendation/output.
12. Write immutable audit/ledger record.
13. Return result and authorization metadata.

Failure at any control point stops execution.
