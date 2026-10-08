CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_agent_roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 role_key text NOT NULL,
 display_name text NOT NULL,
 description text,
 default_risk_level text NOT NULL DEFAULT 'low',
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,role_key)
);

CREATE TABLE IF NOT EXISTS nova_agent_role_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 agent_id uuid NOT NULL REFERENCES nova_agents(id),
 role_id uuid NOT NULL REFERENCES nova_agent_roles(id),
 assigned_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 UNIQUE(agent_id,role_id)
);

CREATE TABLE IF NOT EXISTS nova_agent_handoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 source_agent_id uuid NOT NULL REFERENCES nova_agents(id),
 target_agent_id uuid NOT NULL REFERENCES nova_agents(id),
 task_id uuid REFERENCES nova_agent_tasks(id),
 reason text NOT NULL,
 context_ref jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'requested',
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_agent_workflows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 workflow_key text NOT NULL,
 objective text NOT NULL,
 status text NOT NULL DEFAULT 'queued',
 initiated_by uuid REFERENCES nova_users(id),
 current_agent_id uuid REFERENCES nova_agents(id),
 correlation_id uuid NOT NULL,
 context jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 UNIQUE(tenant_id,correlation_id)
);

CREATE TABLE IF NOT EXISTS nova_agent_workflow_steps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workflow_id uuid NOT NULL REFERENCES nova_agent_workflows(id),
 sequence_no integer NOT NULL,
 agent_id uuid NOT NULL REFERENCES nova_agents(id),
 task_id uuid REFERENCES nova_agent_tasks(id),
 status text NOT NULL DEFAULT 'queued',
 input_ref jsonb NOT NULL DEFAULT '{}',
 output_ref jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 UNIQUE(workflow_id,sequence_no)
);

CREATE TABLE IF NOT EXISTS nova_agent_escalations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 workflow_id uuid REFERENCES nova_agent_workflows(id),
 agent_id uuid REFERENCES nova_agents(id),
 escalation_type text NOT NULL,
 reason text NOT NULL,
 required_actor_type text,
 status text NOT NULL DEFAULT 'open',
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_workflows_status
ON nova_agent_workflows(tenant_id,status,created_at);

CREATE INDEX IF NOT EXISTS idx_agent_handoffs_status
ON nova_agent_handoffs(tenant_id,status,created_at);
