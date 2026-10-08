CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_academy_courses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 course_key text NOT NULL,
 version text NOT NULL,
 title text NOT NULL,
 description text,
 subject_area text NOT NULL,
 difficulty text NOT NULL DEFAULT 'foundational',
 status text NOT NULL DEFAULT 'draft',
 estimated_minutes integer,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 UNIQUE(course_key,version)
);

CREATE TABLE IF NOT EXISTS nova_academy_learning_paths (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 path_key text NOT NULL,
 version text NOT NULL,
 title text NOT NULL,
 description text,
 status text NOT NULL DEFAULT 'draft',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(path_key,version)
);

CREATE TABLE IF NOT EXISTS nova_academy_path_courses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 path_id uuid NOT NULL REFERENCES nova_academy_learning_paths(id),
 course_id uuid NOT NULL REFERENCES nova_academy_courses(id),
 sequence_number integer NOT NULL,
 required boolean NOT NULL DEFAULT true,
 UNIQUE(path_id,course_id),
 UNIQUE(path_id,sequence_number)
);

CREATE TABLE IF NOT EXISTS nova_academy_modules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 course_id uuid NOT NULL REFERENCES nova_academy_courses(id),
 module_key text NOT NULL,
 title text NOT NULL,
 sequence_number integer NOT NULL,
 content_reference text NOT NULL,
 estimated_minutes integer,
 completion_rule jsonb NOT NULL DEFAULT '{}',
 UNIQUE(course_id,module_key)
);

CREATE TABLE IF NOT EXISTS nova_academy_enrollments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid,
 learner_user_id uuid NOT NULL,
 course_id uuid REFERENCES nova_academy_courses(id),
 path_id uuid REFERENCES nova_academy_learning_paths(id),
 status text NOT NULL DEFAULT 'enrolled',
 assigned_by uuid,
 enrolled_at timestamptz NOT NULL DEFAULT now(),
 due_at timestamptz,
 completed_at timestamptz,
 CHECK ((course_id IS NOT NULL) OR (path_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS nova_academy_progress (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 enrollment_id uuid NOT NULL REFERENCES nova_academy_enrollments(id),
 module_id uuid NOT NULL REFERENCES nova_academy_modules(id),
 status text NOT NULL DEFAULT 'not_started',
 progress_percent numeric(5,2) NOT NULL DEFAULT 0,
 last_position jsonb NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(enrollment_id,module_id)
);

CREATE TABLE IF NOT EXISTS nova_academy_assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 course_id uuid NOT NULL REFERENCES nova_academy_courses(id),
 assessment_key text NOT NULL,
 version text NOT NULL,
 title text NOT NULL,
 passing_score numeric(5,2),
 max_attempts integer,
 question_schema jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'draft',
 UNIQUE(course_id,assessment_key,version)
);

CREATE TABLE IF NOT EXISTS nova_academy_assessment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_id uuid NOT NULL REFERENCES nova_academy_assessments(id),
 enrollment_id uuid NOT NULL REFERENCES nova_academy_enrollments(id),
 attempt_number integer NOT NULL,
 response_reference text,
 score numeric(5,2),
 status text NOT NULL DEFAULT 'in_progress',
 started_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz,
 reviewed_by uuid,
 UNIQUE(assessment_id,enrollment_id,attempt_number)
);

CREATE TABLE IF NOT EXISTS nova_academy_completion_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 enrollment_id uuid NOT NULL REFERENCES nova_academy_enrollments(id),
 course_id uuid NOT NULL REFERENCES nova_academy_courses(id),
 course_version text NOT NULL,
 completion_status text NOT NULL DEFAULT 'pending_verification',
 completed_at timestamptz,
 verified_by uuid,
 verification_reference text,
 evidence_reference text,
 UNIQUE(enrollment_id,course_id,course_version)
);

CREATE TABLE IF NOT EXISTS nova_academy_certificates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 completion_record_id uuid NOT NULL REFERENCES nova_academy_completion_records(id),
 certificate_key text NOT NULL UNIQUE,
 certificate_type text NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 status text NOT NULL DEFAULT 'issued',
 artifact_reference text,
 revoked_at timestamptz,
 revocation_reason text
);

CREATE TABLE IF NOT EXISTS nova_academy_instructors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 subject_area text NOT NULL,
 status text NOT NULL DEFAULT 'active',
 credentials_reference text,
 verified_by uuid,
 verified_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_academy_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid,
 learner_user_id uuid,
 enrollment_id uuid REFERENCES nova_academy_enrollments(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academy_enrollments_learner
ON nova_academy_enrollments(learner_user_id,status);

CREATE INDEX IF NOT EXISTS idx_academy_events_tenant
ON nova_academy_events(tenant_id,created_at);
