CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid UNIQUE NOT NULL,
 legal_name text NOT NULL,
 display_name text NOT NULL,
 organization_type text NOT NULL,
 status text NOT NULL DEFAULT 'provisioning',
 lifecycle_reason text,
 primary_contact_user_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 activated_at timestamptz,
 suspended_at timestamptz,
 deactivated_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_organization_locations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES nova_organizations(id),
 location_key text NOT NULL,
 name text NOT NULL,
 address_reference text,
 jurisdiction text,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,location_key)
);

CREATE TABLE IF NOT EXISTS nova_organization_departments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES nova_organizations(id),
 department_key text NOT NULL,
 name text NOT NULL,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,department_key)
);

CREATE TABLE IF NOT EXISTS nova_organization_programs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES nova_organizations(id),
 program_key text NOT NULL,
 name text NOT NULL,
 program_type text NOT NULL,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,program_key)
);

CREATE TABLE IF NOT EXISTS nova_organization_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES nova_organizations(id),
 user_id uuid NOT NULL,
 membership_status text NOT NULL DEFAULT 'invited',
 role_key text NOT NULL,
 location_scope jsonb NOT NULL DEFAULT '[]',
 department_scope jsonb NOT NULL DEFAULT '[]',
 program_scope jsonb NOT NULL DEFAULT '[]',
 invited_at timestamptz,
 activated_at timestamptz,
 revoked_at timestamptz,
 UNIQUE(organization_id,user_id)
);

CREATE TABLE IF NOT EXISTS nova_organization_roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES nova_organizations(id),
 role_key text NOT NULL,
 display_name text NOT NULL,
 description text,
 permissions jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'active',
 UNIQUE(organization_id,role_key)
);

CREATE TABLE IF NOT EXISTS nova_tenant_services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 service_key text NOT NULL,
 status text NOT NULL DEFAULT 'disabled',
 configuration jsonb NOT NULL DEFAULT '{}',
 enabled_at timestamptz,
 disabled_at timestamptz,
 UNIQUE(tenant_id,service_key)
);

CREATE TABLE IF NOT EXISTS nova_tenant_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 policy_key text NOT NULL,
 policy_version text NOT NULL,
 policy_reference text NOT NULL,
 status text NOT NULL DEFAULT 'active',
 effective_at timestamptz,
 expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,policy_key,policy_version)
);

CREATE TABLE IF NOT EXISTS nova_tenant_agents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 agent_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'enabled',
 configuration jsonb NOT NULL DEFAULT '{}',
 enabled_at timestamptz,
 disabled_at timestamptz,
 UNIQUE(tenant_id,agent_id)
);

CREATE TABLE IF NOT EXISTS nova_tenant_integrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 integration_key text NOT NULL,
 integration_type text NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 configuration_reference text,
 enabled_at timestamptz,
 disabled_at timestamptz,
 UNIQUE(tenant_id,integration_key)
);

CREATE TABLE IF NOT EXISTS nova_tenant_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 organization_id uuid REFERENCES nova_organizations(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_users_user
ON nova_organization_users(user_id,membership_status);

CREATE INDEX IF NOT EXISTS idx_tenant_services
ON nova_tenant_services(tenant_id,status);

CREATE INDEX IF NOT EXISTS idx_tenant_events
ON nova_tenant_events(tenant_id,created_at);
