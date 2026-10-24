# Build 65 — NOVA Agent Factory Backend

This build adds the first backend slice for command-driven creation and lifecycle governance of Mr. NOVA specialist agents, extending the existing NOVA CORE, secure runtime, Cognito adapter and evidence-ledger foundations.

Included: typed lifecycle model, tenant-scoped factory store contract, policy-gated agent creation, self-approval denial, default specialist catalog, and PostgreSQL schema for agent profiles, permissions, creation requests, tasks and audit events.

Safety defaults: new agents are inactive; creation requests are not execution permission; permissions are explicit and least-privilege; high/critical-risk activation requires human review; self-approval is denied; tenant identifiers must come from verified server-side identity context.

Status boundary: this is a backend foundation, not yet a fully wired HTTP API or production deployment. Provider execution, CRM/email/billing connectors, production DB migrations, integration tests and deployment verification remain follow-on work. Do not use the fixed-actor demo security adapter outside local development.

Integration order: review and apply the SQL migration; implement a PostgreSQL AgentFactoryStore; mount authenticated API routes in Build 55 runtime; connect task dispatch to NOVA CORE; add provider adapters; test type safety, authorization, tenant isolation, audit durability and deployment gates.
