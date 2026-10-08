CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_voice_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 user_id uuid NOT NULL REFERENCES nova_users(id),
 encounter_id uuid REFERENCES nova_encounters(id),
 authorization_method text NOT NULL,
 status text NOT NULL DEFAULT 'active',
 started_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_transcripts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 voice_session_id uuid NOT NULL REFERENCES nova_voice_sessions(id),
 encounter_id uuid REFERENCES nova_encounters(id),
 language_code text NOT NULL DEFAULT 'en',
 transcript text NOT NULL,
 confidence numeric(5,4),
 status text NOT NULL DEFAULT 'captured',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_voice_extractions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 transcript_id uuid NOT NULL REFERENCES nova_transcripts(id),
 extraction_type text NOT NULL,
 structured_output jsonb NOT NULL,
 confidence numeric(5,4),
 review_status text NOT NULL DEFAULT 'draft',
 reviewed_by uuid REFERENCES nova_users(id),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
