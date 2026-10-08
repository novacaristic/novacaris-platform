CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_environments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 environment_key text NOT NULL,
 environment_type text NOT NULL,
 status text NOT NULL DEFAULT 'active',
 region text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,environment_key)
);

CREATE TABLE IF NOT EXISTS nova_releases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 release_key text NOT NULL,
 version text NOT NULL,
 source_revision text NOT NULL,
 release_type text NOT NULL DEFAULT 'standard',
 status text NOT NULL DEFAULT 'draft',
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,release_key)
);

CREATE TABLE IF NOT EXISTS nova_release_artifacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 release_id uuid NOT NULL REFERENCES nova_releases(id),
 artifact_type text NOT NULL,
 artifact_ref text NOT NULL,
 checksum text,
 metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_release_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 release_id uuid NOT NULL REFERENCES nova_releases(id),
 environment_id uuid NOT NULL REFERENCES nova_environments(id),
 decision text NOT NULL,
 actor_id uuid,
 rationale text,
 decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_deployments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 release_id uuid NOT NULL REFERENCES nova_releases(id),
 environment_id uuid NOT NULL REFERENCES nova_environments(id),
 status text NOT NULL DEFAULT 'pending',
 deployed_revision text,
 deployment_idempotency_key text NOT NULL,
 started_at timestamptz,
 completed_at timestamptz,
 verification_status text DEFAULT 'pending',
 rollback_of uuid REFERENCES nova_deployments(id),
 UNIQUE(environment_id,deployment_idempotency_key)
);

CREATE TABLE IF NOT EXISTS nova_migrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 release_id uuid NOT NULL REFERENCES nova_releases(id),
 migration_key text NOT NULL,
 checksum text NOT NULL,
 direction text NOT NULL DEFAULT 'up',
 status text NOT NULL DEFAULT 'pending',
 applied_at timestamptz,
 UNIQUE(release_id,migration_key,direction)
);

CREATE TABLE IF NOT EXISTS nova_configuration_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 environment_id uuid NOT NULL REFERENCES nova_environments(id),
 config_key text NOT NULL,
 version text NOT NULL,
 value_reference text NOT NULL,
 checksum text,
 approved_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(environment_id,config_key,version)
);

CREATE TABLE IF NOT EXISTS nova_feature_flags (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 flag_key text NOT NULL,
 description text,
 default_enabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,flag_key)
);

CREATE TABLE IF NOT EXISTS nova_feature_flag_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 flag_id uuid NOT NULL REFERENCES nova_feature_flags(id),
 environment_id uuid NOT NULL REFERENCES nova_environments(id),
 enabled boolean NOT NULL DEFAULT false,
 rollout_percent numeric(5,2) NOT NULL DEFAULT 0,
 actor_scope jsonb NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(flag_id,environment_id)
);

CREATE TABLE IF NOT EXISTS nova_release_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 deployment_id uuid NOT NULL REFERENCES nova_deployments(id),
 check_key text NOT NULL,
 status text NOT NULL,
 observed_value jsonb NOT NULL DEFAULT '{}',
 checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_release_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 release_id uuid NOT NULL REFERENCES nova_releases(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 environment_id uuid REFERENCES nova_environments(id),
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deployments_environment
ON nova_deployments(environment_id,status,started_at);

CREATE INDEX IF NOT EXISTS idx_release_events_release
ON nova_release_events(release_id,created_at);
