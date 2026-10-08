CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_service_components (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 component_key text NOT NULL,
 component_type text NOT NULL,
 environment text NOT NULL DEFAULT 'production',
 status text NOT NULL DEFAULT 'unknown',
 version text,
 owner text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,component_key,environment)
);

CREATE TABLE IF NOT EXISTS nova_observability_metrics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 component_id uuid REFERENCES nova_service_components(id),
 metric_name text NOT NULL,
 metric_value numeric,
 unit text,
 dimensions jsonb NOT NULL DEFAULT '{}',
 measured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_health_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 component_id uuid NOT NULL REFERENCES nova_service_components(id),
 check_type text NOT NULL,
 status text NOT NULL,
 latency_ms integer,
 details jsonb NOT NULL DEFAULT '{}',
 checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_reliability_incidents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 incident_key text NOT NULL,
 severity text NOT NULL,
 component_id uuid REFERENCES nova_service_components(id),
 title text NOT NULL,
 description text NOT NULL,
 status text NOT NULL DEFAULT 'open',
 detected_at timestamptz NOT NULL DEFAULT now(),
 acknowledged_at timestamptz,
 resolved_at timestamptz,
 root_cause text,
 remediation text,
 UNIQUE(tenant_id,incident_key)
);

CREATE TABLE IF NOT EXISTS nova_reliability_alerts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 component_id uuid REFERENCES nova_service_components(id),
 alert_type text NOT NULL,
 severity text NOT NULL,
 condition text NOT NULL,
 threshold numeric,
 current_value numeric,
 status text NOT NULL DEFAULT 'open',
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_slo_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 service_key text NOT NULL,
 slo_key text NOT NULL,
 objective numeric(7,4) NOT NULL,
 measurement_window text NOT NULL,
 metric_name text NOT NULL,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,service_key,slo_key)
);

CREATE TABLE IF NOT EXISTS nova_slo_measurements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slo_id uuid NOT NULL REFERENCES nova_slo_definitions(id),
 measured_value numeric(9,5) NOT NULL,
 error_budget_remaining numeric(9,5),
 window_start timestamptz NOT NULL,
 window_end timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_incident_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 incident_id uuid NOT NULL REFERENCES nova_reliability_incidents(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_observability_metrics_component
ON nova_observability_metrics(component_id,metric_name,measured_at);

CREATE INDEX IF NOT EXISTS idx_health_checks_component
ON nova_health_checks(component_id,checked_at);

CREATE INDEX IF NOT EXISTS idx_incidents_status
ON nova_reliability_incidents(tenant_id,status,severity,detected_at);
