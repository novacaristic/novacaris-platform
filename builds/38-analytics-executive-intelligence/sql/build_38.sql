CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_metric_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 metric_key text NOT NULL,
 version text NOT NULL,
 name text NOT NULL,
 description text NOT NULL,
 domain text NOT NULL,
 unit text NOT NULL,
 aggregation_method text NOT NULL,
 source_contract jsonb NOT NULL DEFAULT '{}',
 calculation_reference text NOT NULL,
 owner_role text,
 sensitivity text NOT NULL DEFAULT 'internal',
 status text NOT NULL DEFAULT 'draft',
 effective_from timestamptz,
 effective_to timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(metric_key,version)
);

CREATE TABLE IF NOT EXISTS nova_dashboard_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dashboard_key text NOT NULL,
 version text NOT NULL,
 name text NOT NULL,
 audience_role text NOT NULL,
 description text,
 widget_specification jsonb NOT NULL DEFAULT '[]',
 access_policy_reference text,
 status text NOT NULL DEFAULT 'draft',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(dashboard_key,version)
);

CREATE TABLE IF NOT EXISTS nova_analytics_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid,
 metric_id uuid NOT NULL REFERENCES nova_metric_definitions(id),
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 value_numeric numeric(20,6),
 value_text text,
 status text NOT NULL DEFAULT 'valid',
 sample_size bigint,
 data_freshness_at timestamptz,
 source_lineage jsonb NOT NULL DEFAULT '[]',
 calculation_version text NOT NULL,
 warnings jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS nova_analytics_refresh_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid,
 dashboard_key text NOT NULL,
 status text NOT NULL DEFAULT 'queued',
 requested_by uuid,
 started_at timestamptz,
 completed_at timestamptz,
 source_watermarks jsonb NOT NULL DEFAULT '{}',
 warnings jsonb NOT NULL DEFAULT '[]',
 error_reference text
);

CREATE TABLE IF NOT EXISTS nova_analytics_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid,
 metric_id uuid NOT NULL REFERENCES nova_metric_definitions(id),
 observation_type text NOT NULL,
 severity text NOT NULL DEFAULT 'info',
 observed_value numeric(20,6),
 expected_range jsonb NOT NULL DEFAULT '{}',
 explanation text,
 evidence_references jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'open',
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_analytics_exports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid,
 dashboard_key text NOT NULL,
 format text NOT NULL,
 scope_reference text NOT NULL,
 requested_by uuid NOT NULL,
 approval_reference text,
 status text NOT NULL DEFAULT 'requested',
 artifact_reference text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_analytics_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid,
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 dashboard_key text,
 metric_key text,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_metric_period
ON nova_analytics_snapshots(metric_id,period_start,period_end);

CREATE INDEX IF NOT EXISTS idx_analytics_observations_status
ON nova_analytics_observations(tenant_id,status,severity,created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant
ON nova_analytics_events(tenant_id,created_at);
