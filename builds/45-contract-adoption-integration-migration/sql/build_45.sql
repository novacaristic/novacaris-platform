CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_contract_adoption_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 item_key text NOT NULL UNIQUE,
 source_build_key text NOT NULL,
 source_interface text NOT NULL,
 consumer_build_key text,
 contract_key text NOT NULL,
 contract_version text NOT NULL,
 migration_wave integer NOT NULL DEFAULT 1,
 adapter_reference text,
 owner_role text,
 status text NOT NULL DEFAULT 'discovered',
 compatibility_status text NOT NULL DEFAULT 'unknown',
 rollback_reference text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_contract_migration_tests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 adoption_item_id uuid NOT NULL REFERENCES nova_contract_adoption_items(id),
 test_key text NOT NULL,
 test_type text NOT NULL,
 source_revision text NOT NULL,
 environment text NOT NULL,
 status text NOT NULL DEFAULT 'not_run',
 evidence_reference text,
 limitations jsonb NOT NULL DEFAULT '[]',
 executed_at timestamptz,
 executed_by uuid,
 UNIQUE(adoption_item_id,test_key,source_revision,environment)
);

CREATE TABLE IF NOT EXISTS nova_contract_migration_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 adoption_item_id uuid NOT NULL REFERENCES nova_contract_adoption_items(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_reference text,
 rationale text,
 evidence_reference text,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_contract_migration_exceptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 adoption_item_id uuid NOT NULL REFERENCES nova_contract_adoption_items(id),
 exception_key text NOT NULL UNIQUE,
 reason text NOT NULL,
 risk_level text NOT NULL,
 compensating_control text,
 approved_by uuid,
 approved_at timestamptz,
 expires_at timestamptz,
 status text NOT NULL DEFAULT 'proposed',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_adoption_status
ON nova_contract_adoption_items(status,migration_wave);

CREATE INDEX IF NOT EXISTS idx_contract_migration_tests_status
ON nova_contract_migration_tests(status,environment);
