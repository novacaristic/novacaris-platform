CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_document_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid,
 template_key text NOT NULL,
 name text NOT NULL,
 document_type text NOT NULL,
 version text NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 content_schema jsonb NOT NULL DEFAULT '{}',
 field_schema jsonb NOT NULL DEFAULT '[]',
 source_reference text,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 UNIQUE(tenant_id,template_key,version)
);

CREATE TABLE IF NOT EXISTS nova_forms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 form_key text NOT NULL,
 name text NOT NULL,
 form_type text NOT NULL,
 version text NOT NULL,
 status text NOT NULL DEFAULT 'active',
 schema jsonb NOT NULL DEFAULT '{}',
 UNIQUE(tenant_id,form_key,version)
);

CREATE TABLE IF NOT EXISTS nova_document_instances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 template_id uuid REFERENCES nova_document_templates(id),
 form_id uuid REFERENCES nova_forms(id),
 document_type text NOT NULL,
 title text NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 subject_type text,
 subject_id uuid,
 workflow_instance_id uuid,
 source_revision text,
 generated_by_type text,
 generated_by_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 finalized_at timestamptz,
 finalized_by uuid
);

CREATE TABLE IF NOT EXISTS nova_document_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 document_id uuid NOT NULL REFERENCES nova_document_instances(id),
 version_number integer NOT NULL,
 content_reference text NOT NULL,
 content_checksum text,
 generated_from jsonb NOT NULL DEFAULT '{}',
 created_by_type text NOT NULL,
 created_by_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(document_id,version_number)
);

CREATE TABLE IF NOT EXISTS nova_document_fields (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 document_id uuid NOT NULL REFERENCES nova_document_instances(id),
 field_key text NOT NULL,
 value_reference text,
 value_type text NOT NULL,
 source_type text,
 source_reference text,
 status text NOT NULL DEFAULT 'draft',
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(document_id,field_key)
);

CREATE TABLE IF NOT EXISTS nova_document_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 document_id uuid NOT NULL REFERENCES nova_document_instances(id),
 reviewer_id uuid,
 status text NOT NULL DEFAULT 'pending',
 findings jsonb NOT NULL DEFAULT '[]',
 rationale text,
 reviewed_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_document_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 document_id uuid NOT NULL REFERENCES nova_document_instances(id),
 approval_type text NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 required_role text,
 approver_id uuid,
 rationale text,
 decided_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_document_signatures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 document_id uuid NOT NULL REFERENCES nova_document_instances(id),
 signer_id uuid,
 signature_type text NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 signature_reference text,
 signed_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_document_evidence_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 document_id uuid NOT NULL REFERENCES nova_document_instances(id),
 evidence_reference text NOT NULL,
 relationship_type text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_document_exports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 document_id uuid NOT NULL REFERENCES nova_document_instances(id),
 export_type text NOT NULL,
 destination_reference text NOT NULL,
 status text NOT NULL DEFAULT 'requested',
 requested_by uuid,
 completed_at timestamptz,
 checksum text
);

CREATE TABLE IF NOT EXISTS nova_document_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 document_id uuid REFERENCES nova_document_instances(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_instances_tenant
ON nova_document_instances(tenant_id,status,created_at);

CREATE INDEX IF NOT EXISTS idx_document_events_document
ON nova_document_events(document_id,created_at);
