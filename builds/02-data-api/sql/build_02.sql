CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_encounters (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 encounter_type text NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 started_at timestamptz,
 ended_at timestamptz,
 created_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 encounter_id uuid REFERENCES nova_encounters(id),
 author_user_id uuid REFERENCES nova_users(id),
 note_type text NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 content text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid REFERENCES nova_patients(id),
 encounter_id uuid REFERENCES nova_encounters(id),
 title text NOT NULL,
 description text,
 owner_user_id uuid REFERENCES nova_users(id),
 status text NOT NULL DEFAULT 'open',
 priority text NOT NULL DEFAULT 'normal',
 due_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_idempotency_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 idempotency_key text NOT NULL,
 request_hash text NOT NULL,
 response_status integer,
 response_body jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_encounters_patient ON nova_encounters(tenant_id,patient_id,created_at);
CREATE INDEX IF NOT EXISTS idx_notes_encounter ON nova_notes(tenant_id,encounter_id,version);
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON nova_tasks(tenant_id,owner_user_id,status);
