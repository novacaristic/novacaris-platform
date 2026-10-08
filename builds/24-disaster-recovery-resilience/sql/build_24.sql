CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_recovery_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 policy_key text NOT NULL,
 scope text NOT NULL,
 rto_seconds integer NOT NULL,
 rpo_seconds integer NOT NULL,
 priority integer NOT NULL DEFAULT 100,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,policy_key)
);

CREATE TABLE IF NOT EXISTS nova_backup_sets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 backup_key text NOT NULL,
 backup_type text NOT NULL,
 source_scope text NOT NULL,
 storage_reference text NOT NULL,
 checksum text,
 started_at timestamptz,
 completed_at timestamptz,
 status text NOT NULL DEFAULT 'started',
 verified_at timestamptz,
 UNIQUE(tenant_id,backup_key)
);

CREATE TABLE IF NOT EXISTS nova_restore_tests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 backup_id uuid NOT NULL REFERENCES nova_backup_sets(id),
 environment text NOT NULL,
 status text NOT NULL DEFAULT 'planned',
 started_at timestamptz,
 completed_at timestamptz,
 restored_revision text,
 validation_result jsonb NOT NULL DEFAULT '{}',
 evidence_reference text
);

CREATE TABLE IF NOT EXISTS nova_recovery_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 event_key text NOT NULL,
 event_type text NOT NULL,
 severity text NOT NULL,
 status text NOT NULL DEFAULT 'open',
 declared_at timestamptz,
 resolved_at timestamptz,
 declared_by uuid,
 description text NOT NULL,
 UNIQUE(tenant_id,event_key)
);

CREATE TABLE IF NOT EXISTS nova_continuity_modes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 recovery_event_id uuid REFERENCES nova_recovery_events(id),
 mode text NOT NULL,
 activated_at timestamptz NOT NULL DEFAULT now(),
 deactivated_at timestamptz,
 restrictions jsonb NOT NULL DEFAULT '{}',
 activated_by uuid
);

CREATE TABLE IF NOT EXISTS nova_recovery_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 plan_key text NOT NULL,
 service_scope text NOT NULL,
 priority integer NOT NULL DEFAULT 100,
 dependencies jsonb NOT NULL DEFAULT '[]',
 recovery_steps jsonb NOT NULL DEFAULT '[]',
 verification_steps jsonb NOT NULL DEFAULT '[]',
 owner text,
 status text NOT NULL DEFAULT 'active',
 UNIQUE(tenant_id,plan_key)
);

CREATE TABLE IF NOT EXISTS nova_recovery_exercises (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 exercise_key text NOT NULL,
 exercise_type text NOT NULL,
 scheduled_at timestamptz,
 started_at timestamptz,
 completed_at timestamptz,
 status text NOT NULL DEFAULT 'planned',
 scenario text NOT NULL,
 findings jsonb NOT NULL DEFAULT '{}',
 UNIQUE(tenant_id,exercise_key)
);

CREATE TABLE IF NOT EXISTS nova_recovery_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recovery_event_id uuid REFERENCES nova_recovery_events(id),
 restore_test_id uuid REFERENCES nova_restore_tests(id),
 check_key text NOT NULL,
 status text NOT NULL,
 expected_value jsonb,
 observed_value jsonb,
 checked_at timestamptz NOT NULL DEFAULT now(),
 checked_by uuid
);

CREATE TABLE IF NOT EXISTS nova_recovery_reconciliations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recovery_event_id uuid NOT NULL REFERENCES nova_recovery_events(id),
 subject_scope text NOT NULL,
 reconciliation_type text NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 discrepancies jsonb NOT NULL DEFAULT '[]',
 completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_recovery_events_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recovery_event_id uuid NOT NULL REFERENCES nova_recovery_events(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_events_status
ON nova_recovery_events(tenant_id,status,severity,declared_at);

CREATE INDEX IF NOT EXISTS idx_backup_sets_status
ON nova_backup_sets(tenant_id,status,completed_at);
