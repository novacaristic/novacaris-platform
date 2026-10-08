CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_connector_catalog (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 connector_key text NOT NULL,
 name text NOT NULL,
 category text NOT NULL,
 publisher text NOT NULL,
 version text NOT NULL,
 description text,
 capabilities jsonb NOT NULL DEFAULT '[]',
 required_scopes jsonb NOT NULL DEFAULT '[]',
 security_profile jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'draft',
 published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(connector_key,version)
);

CREATE TABLE IF NOT EXISTS nova_connector_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 connector_id uuid NOT NULL REFERENCES nova_connector_catalog(id),
 version text NOT NULL,
 adapter_contract_version text NOT NULL,
 artifact_reference text NOT NULL,
 checksum text,
 release_notes text,
 status text NOT NULL DEFAULT 'draft',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(connector_id,version)
);

CREATE TABLE IF NOT EXISTS nova_tenant_connectors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 connector_id uuid NOT NULL REFERENCES nova_connector_catalog(id),
 connector_version_id uuid REFERENCES nova_connector_versions(id),
 instance_key text NOT NULL,
 status text NOT NULL DEFAULT 'installed',
 configuration_reference text,
 credential_reference text,
 installed_by uuid,
 installed_at timestamptz NOT NULL DEFAULT now(),
 removed_at timestamptz,
 UNIQUE(tenant_id,instance_key)
);

CREATE TABLE IF NOT EXISTS nova_connector_authorizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_connector_id uuid NOT NULL REFERENCES nova_tenant_connectors(id),
 scope_key text NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 granted_by uuid,
 granted_at timestamptz,
 expires_at timestamptz,
 revoked_at timestamptz,
 UNIQUE(tenant_connector_id,scope_key)
);

CREATE TABLE IF NOT EXISTS nova_connector_sync_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 tenant_connector_id uuid NOT NULL REFERENCES nova_tenant_connectors(id),
 job_type text NOT NULL,
 idempotency_key text NOT NULL,
 status text NOT NULL DEFAULT 'queued',
 cursor_reference text,
 started_at timestamptz,
 completed_at timestamptz,
 result_summary jsonb NOT NULL DEFAULT '{}',
 UNIQUE(tenant_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS nova_connector_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 tenant_connector_id uuid REFERENCES nova_tenant_connectors(id),
 event_type text NOT NULL,
 severity text NOT NULL DEFAULT 'info',
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_connector_health_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_connector_id uuid NOT NULL REFERENCES nova_tenant_connectors(id),
 status text NOT NULL,
 latency_ms integer,
 error_code text,
 details jsonb NOT NULL DEFAULT '{}',
 checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_connector_mappings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_connector_id uuid NOT NULL REFERENCES nova_tenant_connectors(id),
 mapping_key text NOT NULL,
 source_schema jsonb NOT NULL DEFAULT '{}',
 target_schema jsonb NOT NULL DEFAULT '{}',
 transform_reference text,
 version text NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 approved_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_connector_id,mapping_key,version)
);

CREATE TABLE IF NOT EXISTS nova_connector_reconciliations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 tenant_connector_id uuid NOT NULL REFERENCES nova_tenant_connectors(id),
 sync_job_id uuid REFERENCES nova_connector_sync_jobs(id),
 status text NOT NULL DEFAULT 'pending',
 discrepancy_count integer NOT NULL DEFAULT 0,
 result jsonb NOT NULL DEFAULT '{}',
 reviewed_by uuid,
 completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tenant_connectors_status
ON nova_tenant_connectors(tenant_id,status);

CREATE INDEX IF NOT EXISTS idx_connector_events
ON nova_connector_events(tenant_id,created_at);

CREATE INDEX IF NOT EXISTS idx_connector_health
ON nova_connector_health_checks(tenant_connector_id,checked_at);
