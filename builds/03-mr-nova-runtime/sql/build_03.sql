CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_agent_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 requested_by uuid REFERENCES nova_users(id),
 agent_key text NOT NULL,
 task_type text NOT NULL,
 subject_type text,
 subject_id uuid,
 input jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'queued',
 risk_level text NOT NULL DEFAULT 'low',
 authorization_status text NOT NULL DEFAULT 'not_required',
 idempotency_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 completed_at timestamptz,
 UNIQUE(tenant_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS nova_tool_invocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 task_id uuid NOT NULL REFERENCES nova_agent_tasks(id),
 tool_key text NOT NULL,
 risk_level text NOT NULL,
 input_hash text NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 authorization_required boolean NOT NULL DEFAULT false,
 authorized_by uuid REFERENCES nova_users(id),
 output_hash text,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_agent_outputs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 task_id uuid NOT NULL REFERENCES nova_agent_tasks(id),
 output_type text NOT NULL,
 content jsonb NOT NULL,
 confidence numeric(5,4),
 requires_review boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
