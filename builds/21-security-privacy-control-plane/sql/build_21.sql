CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_data_classifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 classification_key text NOT NULL,
 display_name text NOT NULL,
 sensitivity_level integer NOT NULL,
 description text,
 retention_days integer,
 export_restricted boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,classification_key)
);

CREATE TABLE IF NOT EXISTS nova_access_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 user_id uuid REFERENCES nova_users(id),
 agent_id uuid REFERENCES nova_agents(id),
 subject_type text,
 subject_id uuid,
 resource_type text NOT NULL,
 resource_id uuid,
 purpose text NOT NULL,
 decision text NOT NULL,
 reason text NOT NULL,
 policy_reference text,
 correlation_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_privacy_holds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 subject_type text NOT NULL,
 subject_id uuid NOT NULL,
 hold_type text NOT NULL,
 reason text NOT NULL,
 created_by uuid REFERENCES nova_users(id),
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 released_at timestamptz,
 released_by uuid REFERENCES nova_users(id)
);

CREATE TABLE IF NOT EXISTS nova_break_glass_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 user_id uuid NOT NULL REFERENCES nova_users(id),
 subject_type text,
 subject_id uuid,
 purpose text NOT NULL,
 justification text NOT NULL,
 scope jsonb NOT NULL DEFAULT '{}',
 approved_by uuid REFERENCES nova_users(id),
 status text NOT NULL DEFAULT 'requested',
 expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_retention_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 resource_type text NOT NULL,
 classification_id uuid REFERENCES nova_data_classifications(id),
 retention_days integer,
 legal_hold_exempt boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_security_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 event_type text NOT NULL,
 severity text NOT NULL,
 actor_type text,
 actor_id uuid,
 subject_type text,
 subject_id uuid,
 source_ip inet,
 correlation_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'open',
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_security_controls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 control_key text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 configuration jsonb NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,control_key)
);

CREATE INDEX IF NOT EXISTS idx_access_decisions_resource
ON nova_access_decisions(tenant_id,resource_type,resource_id,created_at);

CREATE INDEX IF NOT EXISTS idx_privacy_holds_subject
ON nova_privacy_holds(tenant_id,subject_type,subject_id,status);

CREATE INDEX IF NOT EXISTS idx_security_events_open
ON nova_security_events(tenant_id,status,severity,created_at);
