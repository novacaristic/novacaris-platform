CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_agents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 agent_key text NOT NULL,
 display_name text NOT NULL,
 version text NOT NULL,
 status text NOT NULL DEFAULT 'active',
 environment text NOT NULL DEFAULT 'production',
 owner_user_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id, agent_key, version)
);

CREATE TABLE IF NOT EXISTS nova_tools (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tool_key text NOT NULL UNIQUE,
 display_name text NOT NULL,
 category text NOT NULL,
 risk_level text NOT NULL,
 external_side_effect boolean NOT NULL DEFAULT false,
 requires_human_authorization boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS nova_agent_tool_permissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 agent_id uuid NOT NULL REFERENCES nova_agents(id),
 tool_id uuid NOT NULL REFERENCES nova_tools(id),
 allowed boolean NOT NULL DEFAULT false,
 scopes jsonb NOT NULL DEFAULT '{}',
 requires_approval boolean NOT NULL DEFAULT false,
 UNIQUE(agent_id, tool_id)
);

CREATE TABLE IF NOT EXISTS nova_policy_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 request_id uuid NOT NULL,
 agent_id uuid REFERENCES nova_agents(id),
 tool_id uuid REFERENCES nova_tools(id),
 decision text NOT NULL,
 matched_policy_ids uuid[] NOT NULL DEFAULT '{}',
 rationale text NOT NULL,
 evaluated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_execution_envelopes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 request_id uuid NOT NULL UNIQUE,
 agent_id uuid NOT NULL REFERENCES nova_agents(id),
 actor_user_id uuid,
 subject_type text,
 subject_id uuid,
 tool_id uuid REFERENCES nova_tools(id),
 input_hash text NOT NULL,
 risk_level text NOT NULL,
 authorization_status text NOT NULL DEFAULT 'pending',
 expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_action_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 request_id uuid NOT NULL,
 agent_id uuid REFERENCES nova_agents(id),
 tool_id uuid REFERENCES nova_tools(id),
 action_type text NOT NULL,
 status text NOT NULL,
 input_hash text NOT NULL,
 output_hash text,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_control_switches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 scope_type text NOT NULL,
 scope_id uuid,
 enabled boolean NOT NULL DEFAULT true,
 reason text,
 changed_by uuid,
 changed_at timestamptz NOT NULL DEFAULT now()
);
