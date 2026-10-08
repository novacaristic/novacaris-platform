CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_onboarding_workflows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 workflow_key text NOT NULL,
 status text NOT NULL DEFAULT 'started',
 onboarding_type text NOT NULL,
 current_stage text NOT NULL DEFAULT 'organization_profile',
 started_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 activated_at timestamptz,
 UNIQUE(tenant_id,workflow_key)
);

CREATE TABLE IF NOT EXISTS nova_onboarding_stages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workflow_id uuid NOT NULL REFERENCES nova_onboarding_workflows(id),
 stage_key text NOT NULL,
 sequence_number integer NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 required boolean NOT NULL DEFAULT true,
 started_at timestamptz,
 completed_at timestamptz,
 completion_evidence jsonb NOT NULL DEFAULT '{}',
 UNIQUE(workflow_id,stage_key)
);

CREATE TABLE IF NOT EXISTS nova_onboarding_requirements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workflow_id uuid NOT NULL REFERENCES nova_onboarding_workflows(id),
 stage_id uuid REFERENCES nova_onboarding_stages(id),
 requirement_key text NOT NULL,
 requirement_type text NOT NULL,
 description text NOT NULL,
 status text NOT NULL DEFAULT 'missing',
 evidence_reference text,
 owner_user_id uuid,
 due_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}',
 UNIQUE(workflow_id,requirement_key)
);

CREATE TABLE IF NOT EXISTS nova_onboarding_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workflow_id uuid NOT NULL REFERENCES nova_onboarding_workflows(id),
 stage_id uuid REFERENCES nova_onboarding_stages(id),
 task_key text NOT NULL,
 title text NOT NULL,
 assigned_user_id uuid,
 status text NOT NULL DEFAULT 'open',
 priority text NOT NULL DEFAULT 'normal',
 due_at timestamptz,
 completed_at timestamptz,
 UNIQUE(workflow_id,task_key)
);

CREATE TABLE IF NOT EXISTS nova_onboarding_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workflow_id uuid NOT NULL REFERENCES nova_onboarding_workflows(id),
 integration_key text NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 verification_result jsonb NOT NULL DEFAULT '{}',
 verified_at timestamptz,
 UNIQUE(workflow_id,integration_key)
);

CREATE TABLE IF NOT EXISTS nova_onboarding_readiness (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workflow_id uuid NOT NULL REFERENCES nova_onboarding_workflows(id),
 readiness_type text NOT NULL,
 score numeric(7,2),
 status text NOT NULL DEFAULT 'not_ready',
 blockers jsonb NOT NULL DEFAULT '[]',
 evaluated_at timestamptz,
 UNIQUE(workflow_id,readiness_type)
);

CREATE TABLE IF NOT EXISTS nova_onboarding_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workflow_id uuid NOT NULL REFERENCES nova_onboarding_workflows(id),
 decision_type text NOT NULL,
 decision text NOT NULL,
 actor_id uuid,
 rationale text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_onboarding_activations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workflow_id uuid NOT NULL REFERENCES nova_onboarding_workflows(id),
 activation_status text NOT NULL DEFAULT 'pending',
 activated_by uuid,
 activated_at timestamptz,
 verification_summary jsonb NOT NULL DEFAULT '{}',
 rollback_reason text
);

CREATE TABLE IF NOT EXISTS nova_onboarding_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 workflow_id uuid REFERENCES nova_onboarding_workflows(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_workflows_tenant
ON nova_onboarding_workflows(tenant_id,status);

CREATE INDEX IF NOT EXISTS idx_onboarding_requirements_workflow
ON nova_onboarding_requirements(workflow_id,status);

CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_assignee
ON nova_onboarding_tasks(assigned_user_id,status);
