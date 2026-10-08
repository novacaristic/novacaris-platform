CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_workflow_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid,
 workflow_key text NOT NULL,
 name text NOT NULL,
 description text,
 version text NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 trigger_type text NOT NULL,
 definition jsonb NOT NULL DEFAULT '{}',
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 UNIQUE(tenant_id,workflow_key,version)
);

CREATE TABLE IF NOT EXISTS nova_workflow_stages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workflow_id uuid NOT NULL REFERENCES nova_workflow_definitions(id),
 stage_key text NOT NULL,
 name text NOT NULL,
 sequence_number integer NOT NULL,
 entry_conditions jsonb NOT NULL DEFAULT '{}',
 exit_conditions jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'active',
 UNIQUE(workflow_id,stage_key)
);

CREATE TABLE IF NOT EXISTS nova_workflow_steps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 stage_id uuid NOT NULL REFERENCES nova_workflow_stages(id),
 step_key text NOT NULL,
 name text NOT NULL,
 step_type text NOT NULL,
 sequence_number integer NOT NULL,
 assignee_type text,
 assignee_ref text,
 dependencies jsonb NOT NULL DEFAULT '[]',
 conditions jsonb NOT NULL DEFAULT '{}',
 action jsonb NOT NULL DEFAULT '{}',
 evidence_requirements jsonb NOT NULL DEFAULT '[]',
 timeout_seconds integer,
 retry_policy jsonb NOT NULL DEFAULT '{}',
 required boolean NOT NULL DEFAULT true,
 UNIQUE(stage_id,step_key)
);

CREATE TABLE IF NOT EXISTS nova_workflow_instances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 workflow_definition_id uuid NOT NULL REFERENCES nova_workflow_definitions(id),
 workflow_version text NOT NULL,
 subject_type text,
 subject_id uuid,
 status text NOT NULL DEFAULT 'pending',
 priority text NOT NULL DEFAULT 'normal',
 triggered_by_type text,
 triggered_by_id uuid,
 correlation_id text,
 started_at timestamptz,
 paused_at timestamptz,
 completed_at timestamptz,
 canceled_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_workflow_step_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workflow_instance_id uuid NOT NULL REFERENCES nova_workflow_instances(id),
 step_id uuid NOT NULL REFERENCES nova_workflow_steps(id),
 status text NOT NULL DEFAULT 'pending',
 attempt_number integer NOT NULL DEFAULT 0,
 assigned_to uuid,
 started_at timestamptz,
 completed_at timestamptz,
 result jsonb NOT NULL DEFAULT '{}',
 error jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS nova_workflow_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workflow_instance_id uuid NOT NULL REFERENCES nova_workflow_instances(id),
 step_run_id uuid REFERENCES nova_workflow_step_runs(id),
 task_type text NOT NULL,
 title text NOT NULL,
 assigned_user_id uuid,
 assigned_agent_id uuid,
 status text NOT NULL DEFAULT 'open',
 priority text NOT NULL DEFAULT 'normal',
 due_at timestamptz,
 completed_at timestamptz,
 outcome jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS nova_workflow_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workflow_instance_id uuid NOT NULL REFERENCES nova_workflow_instances(id),
 step_run_id uuid REFERENCES nova_workflow_step_runs(id),
 approval_type text NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 required_role text,
 requested_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 decided_by uuid,
 rationale text
);

CREATE TABLE IF NOT EXISTS nova_workflow_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workflow_instance_id uuid NOT NULL REFERENCES nova_workflow_instances(id),
 step_run_id uuid REFERENCES nova_workflow_step_runs(id),
 evidence_reference text NOT NULL,
 evidence_type text NOT NULL,
 status text NOT NULL DEFAULT 'required',
 verified_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS nova_workflow_escalations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workflow_instance_id uuid NOT NULL REFERENCES nova_workflow_instances(id),
 step_run_id uuid REFERENCES nova_workflow_step_runs(id),
 escalation_type text NOT NULL,
 severity text NOT NULL,
 reason text NOT NULL,
 status text NOT NULL DEFAULT 'open',
 assigned_to uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_workflow_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 workflow_instance_id uuid REFERENCES nova_workflow_instances(id),
 step_run_id uuid REFERENCES nova_workflow_step_runs(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_tenant_status
ON nova_workflow_instances(tenant_id,status);

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_assignee
ON nova_workflow_tasks(assigned_user_id,status);

CREATE INDEX IF NOT EXISTS idx_workflow_events_instance
ON nova_workflow_events(workflow_instance_id,created_at);
