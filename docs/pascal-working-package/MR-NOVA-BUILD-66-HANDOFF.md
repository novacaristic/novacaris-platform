# Mr. NOVA Build 66 — Agent Task Dispatcher

## Purpose
The dispatcher is intended to support bounded task submission and dispatch, tenant-scoped lookups, idempotency, permission checks, human-approval holds, worker leases/retries, and durable audit inserts. The larger design is an owner-controlled master orchestrator, agent registry, authorized client/account context, specialist agents, and a trust layer for identity, access policy, tenant isolation, approval, and audit.

## Recorded repository references
- Repository: `novacaristic/novacaris-platform`
- Feature branch: `feat/nova-agent-task-dispatcher`
- PR #14: https://github.com/novacaristic/novacaris-platform/pull/14
- Recorded head SHA: `c898f934f79b7effdd4263fc49ef70d7fccce3b5`

**Refresh these details in GitHub before relying on them.** They are copied from the supplied notes and may be stale.

## Test setup reported in the source notes
The notes say a focused TypeScript configuration (`tsconfig.agent-task-dispatcher.json`), npm scripts (`typecheck:agent-task-dispatcher`, `test:agent-task-dispatcher`, `check:agent-task-dispatcher`), and a CI step in `.github/workflows/main.yml` were added. Verify that these are present at the current feature-branch head.

The intended suite covers:
1. Permission approval and denial.
2. Human-approval holds for consequential tasks.
3. Idempotency replay and conflict behavior.
4. Bounded worker execution and task completion.
5. Tenant isolation between tenants.

## Status — NOT VERIFIED
The source notes explicitly state that test execution was not confirmed, the branch was not merged, and deployment was not confirmed. Runtime/API routes and production integration were described as not yet wired. Do not report the build as passed or production-ready based on this handoff alone.

## Run focused checks locally
From a local repository clone:
```bash
git fetch origin
git checkout feat/nova-agent-task-dispatcher
git pull origin feat/nova-agent-task-dispatcher
npm install
npm run check:agent-task-dispatcher
```
Save the full output, exit code, Node/npm versions, and commit SHA. Follow a local pass with a completed GitHub Actions run.

## Recommended release sequence
1. Review the live branch, PR diff, migrations, and current commit.
2. Run the focused check and save output.
3. Confirm CI completed successfully.
4. Review authentication, authorization, tenant isolation, and failure paths.
5. Confirm approval gates for consequential actions and safe subagent delegation.
6. Confirm audit durability, idempotency, retries/leases, and runtime/API integration.
7. Obtain required review and merge through the approved process.
8. Deploy separately and run post-deployment smoke tests.
9. Record environment, deployed version, date, evidence, and rollback plan.

## Release evidence tracker
| Gate | Evidence required | Status in source notes |
|---|---|---|
| Local typecheck/tests | Output, exit code, SHA | Not confirmed |
| GitHub Actions | Workflow URL and result | Not confirmed |
| Security review | Reviewer/date/findings | Not recorded |
| PR merge | Merge SHA and URL | Not confirmed |
| Deployment | Environment/version/date | Not confirmed |
| Smoke tests | Commands and results | Not confirmed |

A green unit-test suite alone does not prove production readiness.