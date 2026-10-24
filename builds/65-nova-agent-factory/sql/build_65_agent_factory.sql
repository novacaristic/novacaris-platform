BEGIN;
CREATE SCHEMA IF NOT EXISTS nova_agents;
CREATE TABLE IF NOT EXISTS nova_agents.agent_profiles (
 tenant_id text NOT NULL, agent_id text NOT NULL, profile_id text NOT NULL, name text NOT NULL,
 normalized_name text NOT NULL, purpose text NOT NULL,
 domain text NOT NULL CHECK (domain IN ('SALES','MARKETING','FINANCE','RESEARCH','OPERATIONS','COMPLIANCE','FUNDING','SECURITY','CUSTOM')),
 risk text NOT NULL CHECK (risk IN ('LOW','MODERATE','HIGH','CRITICAL')),
 capabilities jsonb NOT NULL CHECK (jsonb_typeof(capabilities)='array'),
 action_ceiling text NOT NULL CHECK (action_ceiling IN ('READ','RECOMMEND','PREPARE','EXECUTE_WITH_APPROVAL','AUTONOMOUS')),
 requires_human_approval boolean NOT NULL DEFAULT true,
 lifecycle text NOT NULL CHECK (lifecycle IN ('REQUESTED','SPECIFIED','BUILDING','TESTING','APPROVAL_REQUIRED','APPROVED','REGISTERED','ACTIVE','SUSPENDED','FAILED','RETIRED')),
 requested_by text NOT NULL, approved_by text, version integer NOT NULL DEFAULT 1 CHECK (version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,agent_id), UNIQUE (tenant_id,normalized_name),
 CHECK (approved_by IS NULL OR approved_by <> requested_by OR lifecycle <> 'APPROVED')
);
CREATE INDEX IF NOT EXISTS agent_profiles_lifecycle_idx ON nova_agents.agent_profiles(tenant_id,lifecycle);
CREATE TABLE IF NOT EXISTS nova_agents.agent_permissions (
 tenant_id text NOT NULL, permission_id text NOT NULL, agent_id text NOT NULL, resource text NOT NULL,
 actions jsonb NOT NULL CHECK (jsonb_typeof(actions)='array'), scopes jsonb NOT NULL CHECK (jsonb_typeof(scopes)='array'),
 decision text NOT NULL CHECK (decision IN ('ALLOW','DENY','REQUIRE_APPROVAL')),
 requires_human_approval boolean NOT NULL DEFAULT true, granted_by text NOT NULL, expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,permission_id),
 FOREIGN KEY (tenant_id,agent_id) REFERENCES nova_agents.agent_profiles(tenant_id,agent_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS nova_agents.creation_requests (
 tenant_id text NOT NULL, request_id text NOT NULL, requester_id text NOT NULL, requested_name text NOT NULL,
 purpose text NOT NULL, request jsonb NOT NULL CHECK (jsonb_typeof(request)='object'),
 status text NOT NULL CHECK (status IN ('REQUESTED','SPECIFIED','BUILDING','TESTING','APPROVAL_REQUIRED','APPROVED','REGISTERED','ACTIVE','SUSPENDED','FAILED','RETIRED')),
 agent_id text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,request_id),
 FOREIGN KEY (tenant_id,agent_id) REFERENCES nova_agents.agent_profiles(tenant_id,agent_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS nova_agents.tasks (
 tenant_id text NOT NULL, task_id text NOT NULL, agent_id text NOT NULL, created_by text NOT NULL,
 task_type text NOT NULL, input jsonb NOT NULL CHECK (jsonb_typeof(input)='object'),
 status text NOT NULL CHECK (status IN ('QUEUED','RUNNING','WAITING_APPROVAL','SUCCEEDED','FAILED','CANCELLED')),
 result jsonb, error_code text, created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz,
 PRIMARY KEY (tenant_id,task_id),
 FOREIGN KEY (tenant_id,agent_id) REFERENCES nova_agents.agent_profiles(tenant_id,agent_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS agent_tasks_queue_idx ON nova_agents.tasks(tenant_id,status,created_at);
CREATE TABLE IF NOT EXISTS nova_agents.audit_events (
 tenant_id text NOT NULL, event_id text NOT NULL, actor_id text NOT NULL, agent_id text, request_id text,
 event_type text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
 PRIMARY KEY (tenant_id,event_id),
 FOREIGN KEY (tenant_id,agent_id) REFERENCES nova_agents.agent_profiles(tenant_id,agent_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS agent_audit_timeline_idx ON nova_agents.audit_events(tenant_id,occurred_at DESC);
REVOKE UPDATE, DELETE ON nova_agents.audit_events FROM PUBLIC;
COMMIT;
