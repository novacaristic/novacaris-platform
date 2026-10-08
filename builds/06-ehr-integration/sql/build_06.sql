CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_ehr_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 vendor_key text NOT NULL,
 environment text NOT NULL DEFAULT 'sandbox',
 status text NOT NULL DEFAULT 'active',
 configuration_ref text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_ehr_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 connection_id uuid NOT NULL REFERENCES nova_ehr_connections(id),
 patient_id uuid REFERENCES nova_patients(id),
 encounter_id uuid REFERENCES nova_encounters(id),
 note_id uuid REFERENCES nova_notes(id),
 operation text NOT NULL,
 idempotency_key text NOT NULL,
 authorization_status text NOT NULL DEFAULT 'pending',
 status text NOT NULL DEFAULT 'queued',
 request_payload jsonb NOT NULL DEFAULT '{}',
 response_payload jsonb,
 external_resource_id text,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 UNIQUE(connection_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS nova_ehr_sync_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 ehr_request_id uuid NOT NULL REFERENCES nova_ehr_requests(id),
 event_type text NOT NULL,
 external_status text,
 payload_hash text,
 created_at timestamptz NOT NULL DEFAULT now()
);
