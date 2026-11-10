-- =====================================================================
-- BUILD 65 — CLINICAL CHART (Arizona BHRF, 9 A.A.C. 10 Article 7)
-- NovaCärïs EHR: resident chart, note writing, MAR, orders, discharge,
-- AHCCCS claim records, and an Article 7 completeness check.
--
-- Design rules
--  * Every clinical row carries tenant_id (isolated by build_66 RLS).
--  * The acting user comes from the session (nova_current_user()), never
--    from a value the client submits (lesson from DEF-007H).
--  * created_at is always the database clock (R9-10-712(B)(2)).
--  * Once a row is authenticated (signed) it cannot be changed or deleted.
--    Corrections go through nova_chart_amendments (R9-10-712(A)(2)).
--  * A signature can only be applied by the signed-in user themself
--    (R9-10-712(A)(4): the signer is accountable for its use).
--  * Every insert/update/delete on the chart is written to an
--    append-only audit table.
-- Regulatory text should be verified against the current ADHS rule
-- before production use; timing values here are configurable.
-- =====================================================================

SET client_min_messages = warning;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Session identity (security review C1)
-- Server/API path: the API signs a short-lived context with a secret the
--   database also holds (in a table app users cannot read):
--     SET LOCAL app.ctx = 'v1.<tenant>.<user>.<exp_epoch>.<hmac_sha256_hex>'
--   A session cannot impersonate anyone by setting GUCs, because it cannot
--   produce a valid signature.
-- Supabase/PostgREST path: identity comes only from the verified JWT
--   (tenant_id / nova_user_id in app_metadata), and app.ctx is ignored.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nova_context_secret (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 secret text NOT NULL CHECK (length(secret) >= 32),
 rotated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON nova_context_secret FROM PUBLIC;

-- Run once per environment by the database owner (never by the app):
--   SELECT nova_set_context_secret('<same value as NOVA_CONTEXT_SECRET>');
CREATE OR REPLACE FUNCTION nova_set_context_secret(p_secret text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.nova_context_secret(id, secret, rotated_at) VALUES (1, p_secret, now())
  ON CONFLICT (id) DO UPDATE SET secret = EXCLUDED.secret, rotated_at = now();
$$;
REVOKE ALL ON FUNCTION nova_set_context_secret(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION nova_jwt_claim(p_key text) RETURNS text
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> p_key,
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> p_key)
$$;

-- Verifies app.ctx; returns NULLs if absent, malformed, expired or forged.
CREATE OR REPLACE FUNCTION nova_verified_context(OUT tenant_id uuid, OUT user_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE ctx text := current_setting('app.ctx', true); parts text[]; sec text; expected text;
BEGIN
  tenant_id := NULL; user_id := NULL;
  IF ctx IS NULL OR ctx = '' THEN RETURN; END IF;
  parts := string_to_array(ctx, '.');
  IF array_length(parts, 1) <> 5 OR parts[1] <> 'v1' OR parts[4] !~ '^[0-9]{1,12}$' THEN RETURN; END IF;
  IF parts[2] !~* '^[0-9a-f-]{36}$' OR parts[3] !~* '^[0-9a-f-]{36}$' THEN RETURN; END IF;
  IF parts[4]::bigint < extract(epoch FROM clock_timestamp())::bigint THEN RETURN; END IF;
  SELECT secret INTO sec FROM public.nova_context_secret WHERE id = 1;
  IF sec IS NULL THEN RETURN; END IF;
  expected := encode(hmac(parts[1] || '.' || parts[2] || '.' || parts[3] || '.' || parts[4], sec, 'sha256'), 'hex');
  IF expected <> lower(parts[5]) THEN RETURN; END IF;
  tenant_id := parts[2]::uuid;
  user_id := NULLIF(parts[3], '00000000-0000-0000-0000-000000000000')::uuid;
END $$;

CREATE OR REPLACE FUNCTION nova_is_jwt_session() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT current_user = 'authenticated'
$$;

CREATE OR REPLACE FUNCTION nova_current_tenant() RETURNS uuid
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN nova_is_jwt_session() THEN nova_jwt_claim('tenant_id')::uuid
              ELSE (nova_verified_context()).tenant_id END
$$;

CREATE OR REPLACE FUNCTION nova_current_user() RETURNS uuid
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN nova_is_jwt_session() THEN nova_jwt_claim('nova_user_id')::uuid
              ELSE (nova_verified_context()).user_id END
$$;

-- True only for a superuser with no session context (migrations / seeding).
CREATE OR REPLACE FUNCTION nova_is_owner_maintenance() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT nova_current_user() IS NULL
     AND COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false)
$$;

-- ---------------------------------------------------------------------
-- Rule settings (per tenant, so they follow the agency's P&P)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nova_chart_rules (
 tenant_id uuid PRIMARY KEY REFERENCES nova_tenants(id),
 tb_clearance_days integer NOT NULL DEFAULT 7,          -- R9-10-707: before or within 7 calendar days of admission
 note_late_entry_hours integer NOT NULL DEFAULT 24,      -- agency policy
 record_retrieval_max_hours integer NOT NULL DEFAULT 24, -- R9-10-712(A)(6): agency must set this
 require_note_cosign_roles text[] NOT NULL DEFAULT '{}',   -- credentials whose notes always need a cosign
 facility_timezone text NOT NULL DEFAULT 'America/Phoenix',
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE nova_chart_rules ADD COLUMN IF NOT EXISTS facility_timezone text NOT NULL DEFAULT 'America/Phoenix';

-- Staff roster: who may prescribe, verify orders, give meds, supervise (C6).
-- Maintained by agency administrators through a service path; read-only to app users.
CREATE TABLE IF NOT EXISTS nova_staff_credentials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 user_id uuid NOT NULL UNIQUE REFERENCES nova_users(id),
 credential text NOT NULL,                       -- e.g. MD, PMHNP, RN, LPN, BHP, BHT
 may_prescribe boolean NOT NULL DEFAULT false,
 may_verify_orders boolean NOT NULL DEFAULT false,
 may_administer_medication boolean NOT NULL DEFAULT false,
 may_assist_self_administration boolean NOT NULL DEFAULT false,
 may_supervise boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION nova_staff(p_user uuid) RETURNS nova_staff_credentials
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT * FROM nova_staff_credentials WHERE user_id = p_user AND active
$$;

-- ---------------------------------------------------------------------
-- Append-only chart audit
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nova_chart_audit (
 id bigserial PRIMARY KEY,
 tenant_id uuid NOT NULL,
 table_name text NOT NULL,
 row_id uuid,
 operation text NOT NULL,
 actor_user_id uuid,
 db_role text NOT NULL DEFAULT current_user,
 old_row jsonb,
 new_row jsonb,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_chart_audit_row ON nova_chart_audit(tenant_id, table_name, row_id, occurred_at);

CREATE OR REPLACE FUNCTION nova_chart_audit_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r jsonb := to_jsonb(COALESCE(NEW, OLD));
BEGIN
  INSERT INTO public.nova_chart_audit(tenant_id, table_name, row_id, operation, actor_user_id, db_role, old_row, new_row)
  VALUES ((r->>'tenant_id')::uuid, TG_TABLE_NAME, (r->>'id')::uuid, TG_OP, public.nova_current_user(), session_user::text,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN NULL;
END $$;

-- ---------------------------------------------------------------------
-- Generic chart guard: server clock, self-signing, lock after signature.
-- TG_ARGV = columns that may still be filled in ONCE after signing
-- (e.g. a PRN effect assessment recorded later).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nova_chart_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
-- TG_ARGV entries:
--   'col'                 column that may be filled in ONCE after signing (NULL -> value)
--   'col=a>b,b>c'         column that may change after signing, only by these transitions
DECLARE
  me uuid := nova_current_user();
  maint boolean := nova_is_owner_maintenance();
  fill text[] := '{}'; trans jsonb := '{}'; managed text[] := '{}'; arg text; col text; k text;
  o jsonb; n jsonb; skip text[]; pair text;
  other_signer_ok boolean := TG_TABLE_NAME IN ('nova_clinical_orders','nova_medication_orders','nova_admissions','nova_diagnostic_reports');
BEGIN
  FOREACH arg IN ARRAY COALESCE(TG_ARGV::text[], '{}') LOOP
    IF left(arg,1) = '~' THEN managed := managed || substr(arg,2);
    ELSIF position('=' IN arg) > 0 THEN
      trans := trans || jsonb_build_object(split_part(arg,'=',1), to_jsonb(string_to_array(split_part(arg,'=',2), ',')));
    ELSE fill := fill || arg; END IF;
  END LOOP;
  IF me IS NULL AND NOT maint THEN
    RAISE EXCEPTION 'NO_SESSION_USER: a verified session user is required';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.authenticated_at IS NOT NULL THEN
      RAISE EXCEPTION 'CHART_LOCKED: signed % record % cannot be deleted; file an amendment', TG_TABLE_NAME, OLD.id;
    END IF;
    IF NOT maint AND OLD.entered_by IS DISTINCT FROM me THEN
      RAISE EXCEPTION 'NOT_AUTHOR: only the author can delete an unsigned draft';
    END IF;
    RETURN OLD;
  END IF;

  n := to_jsonb(NEW);
  -- admission must belong to the same resident
  IF n ? 'admission_id' AND n ? 'patient_id' AND n->>'admission_id' IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM nova_admissions x WHERE x.id = (n->>'admission_id')::uuid
                   AND x.patient_id = (n->>'patient_id')::uuid AND x.tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'WRONG_RESIDENT: admission does not belong to this resident';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.entered_by := me;                          -- never trust a submitted author
    IF NEW.authenticated_by IS NOT NULL THEN
      IF me IS NULL OR NEW.authenticated_by <> me THEN
        RAISE EXCEPTION 'SIGNATURE_NOT_OWN: only the signed-in user can apply their own signature';
      END IF;
      NEW.authenticated_at := now();
    ELSE
      NEW.authenticated_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  o := to_jsonb(OLD);
  NEW.created_at := OLD.created_at;
  NEW.entered_by := OLD.entered_by;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'CHART_IDENTITY: id and tenant cannot change';
  END IF;

  IF OLD.authenticated_at IS NOT NULL THEN
    NEW.authenticated_by := OLD.authenticated_by;
    NEW.authenticated_at := OLD.authenticated_at;
    n := to_jsonb(NEW);
    SELECT array_agg(x) INTO skip FROM (SELECT unnest(fill) x UNION SELECT jsonb_object_keys(trans) UNION SELECT unnest(managed) UNION SELECT 'updated_at') s;
    IF (n - skip) IS DISTINCT FROM (o - skip) THEN
      RAISE EXCEPTION 'CHART_LOCKED: % record % is signed; file an amendment instead', TG_TABLE_NAME, OLD.id;
    END IF;
    FOREACH k IN ARRAY fill LOOP
      IF (o->>k) IS NOT NULL AND (o->k) IS DISTINCT FROM (n->k) THEN
        RAISE EXCEPTION 'CHART_LOCKED: % already recorded on % %', k, TG_TABLE_NAME, OLD.id;
      END IF;
    END LOOP;
    FOR col IN SELECT jsonb_object_keys(trans) LOOP
      IF (o->col) IS DISTINCT FROM (n->col) THEN
        pair := COALESCE(o->>col,'null') || '>' || COALESCE(n->>col,'null');
        IF NOT (trans->col) ? pair THEN
          RAISE EXCEPTION 'CHART_TRANSITION: % cannot change from % to % on a signed record', col, o->>col, n->>col;
        END IF;
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  -- unsigned row
  IF NOT maint AND OLD.entered_by IS DISTINCT FROM me THEN
    -- someone other than the author may only apply their own signature, on tables built for it
    IF NEW.authenticated_by IS NULL
       OR (n - ARRAY['authenticated_by','authenticated_at','updated_at']) IS DISTINCT FROM (o - ARRAY['authenticated_by','authenticated_at','updated_at']) THEN
      RAISE EXCEPTION 'NOT_AUTHOR: only the author can change an unsigned draft';
    END IF;
    IF NOT other_signer_ok THEN
      RAISE EXCEPTION 'SIGN_NOT_AUTHOR: only the author can sign this record';
    END IF;
    IF TG_TABLE_NAME = 'nova_admissions' AND (n->>'authenticated_by') IS DISTINCT FROM (o->>'admitting_professional_user_id') THEN
      RAISE EXCEPTION 'SIGN_NOT_AUTHOR: an admission is signed by its author or the admitting professional';
    END IF;
  END IF;
  IF NEW.authenticated_by IS NOT NULL THEN
    IF me IS NULL OR NEW.authenticated_by <> me THEN
      RAISE EXCEPTION 'SIGNATURE_NOT_OWN: only the signed-in user can apply their own signature';
    END IF;
    NEW.authenticated_at := now();
  ELSE
    NEW.authenticated_at := NULL;
  END IF;
  RETURN NEW;
END $$;

-- Helper to attach guard + audit triggers to a chart table
CREATE OR REPLACE FUNCTION nova_chart_attach(p_table text, p_allow text[] DEFAULT '{}') RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE args text := '';
BEGIN
  IF array_length(p_allow,1) IS NOT NULL THEN
    SELECT string_agg(quote_literal(a), ',') INTO args FROM unnest(p_allow) a;
  END IF;
  EXECUTE format('DROP TRIGGER IF EXISTS z_chart_guard ON %I', p_table);
  EXECUTE format('CREATE TRIGGER z_chart_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION nova_chart_guard(%s)', p_table, args);
  EXECUTE format('DROP TRIGGER IF EXISTS zz_chart_audit ON %I', p_table);
  EXECUTE format('CREATE TRIGGER zz_chart_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION nova_chart_audit_fn()', p_table);
END $$;

-- Sign any chart record as the current user
CREATE OR REPLACE FUNCTION nova_sign(p_table regclass, p_id uuid) RETURNS timestamptz
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE t timestamptz;
BEGIN
  IF nova_current_user() IS NULL THEN RAISE EXCEPTION 'NO_SESSION_USER'; END IF;
  EXECUTE format('UPDATE %s SET authenticated_by = nova_current_user() WHERE id = $1 AND authenticated_at IS NULL RETURNING authenticated_at', p_table)
    INTO t USING p_id;
  IF t IS NULL THEN RAISE EXCEPTION 'NOT_SIGNABLE: % % not found, not visible, or already signed', p_table, p_id; END IF;
  RETURN t;
END $$;

-- ---------------------------------------------------------------------
-- Common column block (repeated per table)
--  id, tenant_id, patient_id, admission_id, entered_by, created_at,
--  authenticated_by, authenticated_by_credential, authenticated_at
-- ---------------------------------------------------------------------

-- 1. Resident identification — R9-10-712(C): name, address, DOB
CREATE TABLE IF NOT EXISTS nova_resident_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL UNIQUE REFERENCES nova_patients(id),
 legal_first_name text NOT NULL,
 legal_last_name text NOT NULL,
 preferred_name text,
 date_of_birth date NOT NULL,
 address_line1 text, address_line2 text, city text, state text, postal_code text,
 phone text,
 ahcccs_member_id text,
 primary_language text,
 has_health_care_directive boolean NOT NULL DEFAULT false,
 allergies_reviewed boolean NOT NULL DEFAULT false,      -- true + no rows = "No known allergies"
 photo_document_ref text,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz
);

-- 2. Allergies (including medication allergies) — R9-10-712(C)
CREATE TABLE IF NOT EXISTS nova_resident_allergies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 allergen text NOT NULL,
 allergy_type text NOT NULL CHECK (allergy_type IN ('medication','food','environmental','other')),
 reaction text,
 severity text CHECK (severity IN ('mild','moderate','severe','unknown')),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','entered_in_error')),
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz
);

-- 3. Admission — admitting professional, diagnosis/presenting issues, dates, court orders
CREATE TABLE IF NOT EXISTS nova_admissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 program_label text,
 admitted_at timestamptz NOT NULL,
 admitting_professional_user_id uuid REFERENCES nova_users(id),
 admitting_professional_name text NOT NULL,
 admitting_professional_credential text NOT NULL,
 admitting_diagnoses text[] NOT NULL DEFAULT '{}',      -- ICD-10 codes
 presenting_issues text,
 level_of_care text,
 court_ordered boolean NOT NULL DEFAULT false,
 court_order_reference text,                            -- A.R.S. Title 36, Ch. 5 order, if applicable
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','discharged','cancelled')),
 discharged_at timestamptz,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz,
 discharge_authenticated_by uuid REFERENCES nova_users(id),
 CHECK (presenting_issues IS NOT NULL OR COALESCE(array_length(admitting_diagnoses,1),0) > 0),
 CHECK (NOT court_ordered OR court_order_reference IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_admissions_patient ON nova_admissions(tenant_id, patient_id, admitted_at);

-- 4. Representative / guardian — R9-10-712(C)
CREATE TABLE IF NOT EXISTS nova_resident_representatives (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 representative_type text NOT NULL CHECK (representative_type IN
   ('resident_designated','legal_guardian','health_care_poa','mental_health_care_poa','other')),
 full_name text NOT NULL,
 phone text, email text, address text,
 authority_basis text NOT NULL CHECK (authority_basis IN ('resident_signed_consent','court_order','power_of_attorney')),
 authority_document_ref text NOT NULL,           -- signed consent, POA copy, or court order copy
 active boolean NOT NULL DEFAULT true,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz
);

-- 5. General and informed consent — R9-10-712(C)
CREATE TABLE IF NOT EXISTS nova_consents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 admission_id uuid REFERENCES nova_admissions(id),
 consent_type text NOT NULL CHECK (consent_type IN
   ('general','informed_treatment','informed_psychotropic','release_of_information','telehealth','other')),
 description text NOT NULL,
 signed_by_name text NOT NULL,
 signer_relationship text NOT NULL CHECK (signer_relationship IN ('resident','representative')),
 representative_id uuid REFERENCES nova_resident_representatives(id),
 signed_on date NOT NULL,
 expires_on date,
 revoked_on date,
 document_ref text,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz,
 CHECK (signer_relationship = 'resident' OR representative_id IS NOT NULL)
);

-- 6. Health care directive copy — R9-10-712(C)
CREATE TABLE IF NOT EXISTS nova_health_care_directives (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 directive_type text NOT NULL CHECK (directive_type IN ('living_will','health_care_poa','mental_health_care_poa','prehospital_medical_care','other')),
 executed_on date,
 document_ref text NOT NULL,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz
);

-- 7. Medical history & physical examination — R9-10-712(C)
CREATE TABLE IF NOT EXISTS nova_history_physicals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 admission_id uuid REFERENCES nova_admissions(id),
 performed_on date NOT NULL,
 practitioner_name text NOT NULL,
 practitioner_credential text NOT NULL,
 medical_history text NOT NULL,
 exam_findings text NOT NULL,
 source text NOT NULL DEFAULT 'onsite' CHECK (source IN ('onsite','received_from_provider')),
 document_ref text,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz
);

-- 8. Freedom from infectious tuberculosis — R9-10-707 / R9-10-712(C)
CREATE TABLE IF NOT EXISTS nova_tb_screenings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 admission_id uuid REFERENCES nova_admissions(id),
 method text NOT NULL CHECK (method IN ('tst','igra','chest_xray','symptom_screen','exempt_short_stay','prior_admission_record')),
 performed_on date NOT NULL,
 result text NOT NULL CHECK (result IN ('negative','positive_cleared','positive_not_cleared','pending','exempt')),
 exemption_reason text,
 document_ref text,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz,
 CHECK (result <> 'exempt' OR exemption_reason IS NOT NULL)
);

-- 9. Behavioral health assessment — R9-10-707 / R9-10-712(C)
CREATE TABLE IF NOT EXISTS nova_bh_assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 admission_id uuid NOT NULL REFERENCES nova_admissions(id),
 assessment_type text NOT NULL CHECK (assessment_type IN ('initial','update','received_from_provider')),
 performed_on date NOT NULL,
 performed_by_name text NOT NULL,
 performed_by_credential text NOT NULL,
 presenting_concerns text NOT NULL,
 psychiatric_history text,
 substance_use_history text,
 medical_concerns text,
 risk_assessment text NOT NULL,           -- danger to self/others, elopement, etc.
 strengths_needs text,
 diagnoses text[] NOT NULL DEFAULT '{}',
 recommendations text NOT NULL,
 resident_participated boolean NOT NULL DEFAULT true,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz
);

-- 10. Treatment plan — R9-10-708 / R9-10-712(C)
CREATE TABLE IF NOT EXISTS nova_treatment_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 admission_id uuid NOT NULL REFERENCES nova_admissions(id),
 version integer NOT NULL DEFAULT 1,
 plan_type text NOT NULL DEFAULT 'initial' CHECK (plan_type IN ('initial','review','update')),
 effective_on date NOT NULL,
 review_due_on date,
 presenting_issues text NOT NULL,
 discharge_criteria text,
 resident_participated boolean NOT NULL,
 resident_signature_ref text,
 representative_signature_ref text,
 developed_by_name text NOT NULL,
 developed_by_credential text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','superseded')),
 supersedes_plan_id uuid REFERENCES nova_treatment_plans(id),
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz,
 UNIQUE (admission_id, version)
);

CREATE TABLE IF NOT EXISTS nova_treatment_plan_goals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 treatment_plan_id uuid NOT NULL REFERENCES nova_treatment_plans(id),
 goal_number integer NOT NULL,
 problem text NOT NULL,
 goal text NOT NULL,
 measurable_objective text NOT NULL,
 interventions text NOT NULL,
 frequency text NOT NULL,
 responsible_role text NOT NULL,
 target_date date,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','met','revised','discontinued')),
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz,
 UNIQUE (treatment_plan_id, goal_number)
);

-- 11. NOTE WRITING — progress notes / documentation of services provided
--     R9-10-712(C): progress notes; behavioral and physical health services provided
CREATE TABLE IF NOT EXISTS nova_clinical_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 admission_id uuid NOT NULL REFERENCES nova_admissions(id),
 note_type text NOT NULL CHECK (note_type IN
   ('progress','shift','individual_counseling','group_counseling','nursing','psychiatric','case_management',
    'skills_training','health_service','interval','contact','other')),
 service_date date NOT NULL,
 start_time time,
 end_time time,
 location text,
 service_code text,                       -- HCPCS/CPT used for billing, if billable
 modifiers text[] NOT NULL DEFAULT '{}',
 units numeric(6,2),
 treatment_plan_goal_ids uuid[] NOT NULL DEFAULT '{}',
 narrative text NOT NULL,                 -- what happened / interventions
 resident_response text,                  -- response to intervention, progress toward goals
 plan_next_steps text,
 risk_flags text[] NOT NULL DEFAULT '{}',
 ai_drafted boolean NOT NULL DEFAULT false,      -- NovaClerk / DEGOSH produced the draft
 source_ai_note_id uuid REFERENCES nova_notes(id),
 author_credential text,
 requires_cosign boolean NOT NULL DEFAULT false,
 cosigned_by uuid REFERENCES nova_users(id),
 cosigned_at timestamptz,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz,
 CHECK (end_time IS NULL OR start_time IS NULL OR end_time > start_time),
 CHECK (length(trim(narrative)) >= 20)
);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_adm ON nova_clinical_notes(tenant_id, admission_id, service_date);

-- AI drafts must be signed by a human who did not just rubber-stamp an empty field
CREATE OR REPLACE FUNCTION nova_note_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE me uuid := nova_current_user(); rules nova_chart_rules; cred text; author uuid;
BEGIN
  SELECT * INTO rules FROM nova_chart_rules WHERE tenant_id = NEW.tenant_id;
  author := CASE WHEN TG_OP = 'INSERT' THEN me ELSE OLD.entered_by END;
  SELECT credential INTO cred FROM nova_staff_credentials WHERE user_id = author AND active;
  IF cred IS NOT NULL AND cred = ANY(COALESCE(rules.require_note_cosign_roles, '{}')) THEN
    NEW.requires_cosign := true;                         -- policy, not the author's choice
  END IF;
  IF COALESCE(array_length(NEW.treatment_plan_goal_ids,1),0) > 0 AND EXISTS (
       SELECT 1 FROM unnest(NEW.treatment_plan_goal_ids) gid
       WHERE NOT EXISTS (SELECT 1 FROM nova_treatment_plan_goals g JOIN nova_treatment_plans t ON t.id = g.treatment_plan_id
                         WHERE g.id = gid AND t.admission_id = NEW.admission_id)) THEN
    RAISE EXCEPTION 'NOTE_GOAL_INVALID: linked goals must belong to this resident''s treatment plan';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.cosigned_by := NULL; NEW.cosigned_at := NULL;
    RETURN NEW;
  END IF;
  IF OLD.requires_cosign AND NOT NEW.requires_cosign AND OLD.authenticated_at IS NULL THEN
    RAISE EXCEPTION 'COSIGN_REQUIRED: a required cosign cannot be removed';
  END IF;
  IF OLD.cosigned_by IS NULL AND NEW.cosigned_by IS NOT NULL THEN
    IF OLD.authenticated_at IS NULL THEN RAISE EXCEPTION 'COSIGN_BEFORE_SIGN: author must sign first'; END IF;
    IF NEW.cosigned_by IS DISTINCT FROM me THEN RAISE EXCEPTION 'SIGNATURE_NOT_OWN: cosigner must be the signed-in user'; END IF;
    IF NEW.cosigned_by = OLD.authenticated_by THEN RAISE EXCEPTION 'COSIGN_SELF: author cannot cosign own note'; END IF;
    IF NOT COALESCE((nova_staff(me)).may_supervise, false) THEN RAISE EXCEPTION 'COSIGN_NOT_SUPERVISOR: cosigner is not a supervisor on the staff roster'; END IF;
    NEW.cosigned_at := now();
  ELSIF NEW.cosigned_at IS DISTINCT FROM OLD.cosigned_at OR NEW.cosigned_by IS DISTINCT FROM OLD.cosigned_by THEN
    RAISE EXCEPTION 'COSIGN_FORGED: cosign time/person can only be set by cosigning';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_note_rules ON nova_clinical_notes;
CREATE TRIGGER a_note_rules BEFORE INSERT OR UPDATE ON nova_clinical_notes FOR EACH ROW EXECUTE FUNCTION nova_note_rules();

-- Amendments / late corrections (original stays readable)
CREATE TABLE IF NOT EXISTS nova_chart_amendments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 target_table text NOT NULL,
 target_id uuid NOT NULL,
 amendment_type text NOT NULL CHECK (amendment_type IN ('correction','addendum','late_entry','entered_in_error')),
 reason text NOT NULL,
 amended_content text NOT NULL,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz
);

-- 12. Orders — R9-10-712(A)(3): dated with time, authenticated by the issuing
--     practitioner/BHP; verbal orders authenticated by whoever gave them
CREATE TABLE IF NOT EXISTS nova_clinical_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 admission_id uuid NOT NULL REFERENCES nova_admissions(id),
 order_kind text NOT NULL CHECK (order_kind IN ('medication','lab','diagnostic','diet','activity','precaution','other')),
 order_text text NOT NULL,
 order_source text NOT NULL CHECK (order_source IN ('written','electronic','verbal','telephone')),
 ordered_at timestamptz NOT NULL,                         -- date AND time
 issuing_practitioner_user_id uuid REFERENCES nova_users(id),
 issuing_practitioner_name text NOT NULL,
 issuing_practitioner_credential text NOT NULL,
 received_by_name text,                                   -- staff who took a verbal order
 discontinued_at timestamptz,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz,
 CHECK (order_source NOT IN ('verbal','telephone') OR received_by_name IS NOT NULL)
);

CREATE OR REPLACE FUNCTION nova_order_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.authenticated_by IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.authenticated_by IS NULL) THEN
    IF NEW.authenticated_by IS DISTINCT FROM NEW.issuing_practitioner_user_id THEN
      RAISE EXCEPTION 'ORDER_AUTH: an order must be authenticated by the practitioner who issued it';
    END IF;
    IF NOT COALESCE((nova_staff(NEW.authenticated_by)).may_prescribe, false) THEN
      RAISE EXCEPTION 'ORDER_AUTH_NOT_PRESCRIBER: issuer is not a prescriber on the staff roster';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.discontinued_at := NULL; NEW.discontinued_by := NULL;
  ELSIF OLD.discontinued_at IS NULL AND NEW.discontinued_at IS NOT NULL THEN
    IF NOT (COALESCE((nova_staff(nova_current_user())).may_prescribe, false) OR COALESCE((nova_staff(nova_current_user())).may_verify_orders, false)) THEN
      RAISE EXCEPTION 'ORDER_DISCONTINUE_NOT_PERMITTED: only prescribers or order-verifying staff can discontinue an order';
    END IF;
    NEW.discontinued_at := now(); NEW.discontinued_by := nova_current_user();
  ELSIF NEW.discontinued_by IS DISTINCT FROM OLD.discontinued_by THEN
    RAISE EXCEPTION 'ORDER_FORGED: discontinued_by is set only when discontinuing';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_order_rules ON nova_clinical_orders;
CREATE TRIGGER a_order_rules BEFORE INSERT OR UPDATE ON nova_clinical_orders FOR EACH ROW EXECUTE FUNCTION nova_order_rules();

-- 13. MEDICATION — orders transcribed to the MAR
CREATE TABLE IF NOT EXISTS nova_medication_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 admission_id uuid NOT NULL REFERENCES nova_admissions(id),
 clinical_order_id uuid NOT NULL REFERENCES nova_clinical_orders(id),
 medication_name text NOT NULL,
 strength text NOT NULL,
 dose text NOT NULL,
 route text NOT NULL,
 frequency text NOT NULL,
 scheduled_times time[] NOT NULL DEFAULT '{}',
 is_prn boolean NOT NULL DEFAULT false,
 prn_indication text,
 prn_max_doses_per_day integer,
 is_psychotropic boolean NOT NULL DEFAULT false,
 is_pain_medication boolean NOT NULL DEFAULT false,
 self_administration_assistance boolean NOT NULL DEFAULT false,
 start_date date NOT NULL,
 stop_date date,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','held','discontinued','completed')),
 status_changed_by uuid REFERENCES nova_users(id),
 status_changed_at timestamptz,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),        -- transcription verified by
 authenticated_at timestamptz,
 CHECK (NOT is_prn OR prn_indication IS NOT NULL)
);

ALTER TABLE nova_medication_orders ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES nova_users(id);
ALTER TABLE nova_medication_orders ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
ALTER TABLE nova_clinical_orders ADD COLUMN IF NOT EXISTS discontinued_by uuid REFERENCES nova_users(id);

-- 14. MAR — R9-10-712(C) medication administration documentation
CREATE TABLE IF NOT EXISTS nova_medication_administrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 admission_id uuid NOT NULL REFERENCES nova_admissions(id),
 medication_order_id uuid NOT NULL REFERENCES nova_medication_orders(id),
 scheduled_for timestamptz,
 administered_at timestamptz NOT NULL,                    -- date and time
 outcome text NOT NULL CHECK (outcome IN ('given','self_administered_with_assistance','refused','held','missed','not_available')),
 medication_name text NOT NULL,                           -- copied from order at entry
 strength text NOT NULL,
 dose_given text NOT NULL,
 route text NOT NULL,
 reason_not_given text,
 pre_pain_assessment text,                                -- pain med, initial or PRN
 pre_behavior_assessment text,                            -- psychotropic, initial or PRN
 effect_assessment text,                                  -- may be recorded after signing
 effect_assessed_at timestamptz,
 effect_assessed_by uuid REFERENCES nova_users(id),
 adverse_reaction text,                                   -- may be recorded after signing
 variance_note text,                                      -- any difference from the order, explained
 administered_by_name text NOT NULL,
 professional_designation text NOT NULL,                  -- e.g., RN, LPN, BHT
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),         -- signature of administering staff
 authenticated_at timestamptz,
 CHECK (outcome IN ('given','self_administered_with_assistance') OR reason_not_given IS NOT NULL)
);
ALTER TABLE nova_medication_administrations ADD COLUMN IF NOT EXISTS variance_note text;
CREATE INDEX IF NOT EXISTS idx_mar_adm ON nova_medication_administrations(tenant_id, admission_id, administered_at);

CREATE OR REPLACE FUNCTION nova_mar_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE o nova_medication_orders; co nova_clinical_orders; st nova_staff_credentials; tz text; given_today integer;
        initial boolean; is_given boolean; me uuid := nova_current_user();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.effect_assessment IS NULL AND NEW.effect_assessment IS NOT NULL THEN
      NEW.effect_assessed_at := now();
      NEW.effect_assessed_by := me;
    ELSIF NEW.effect_assessed_at IS DISTINCT FROM OLD.effect_assessed_at OR NEW.effect_assessed_by IS DISTINCT FROM OLD.effect_assessed_by THEN
      RAISE EXCEPTION 'MAR_FORGED: effect time/person is set only when the effect is recorded';
    END IF;
    RETURN NEW;
  END IF;

  -- lock the order so concurrent passes cannot both slip under the PRN cap
  SELECT * INTO o FROM nova_medication_orders WHERE id = NEW.medication_order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'MAR_ORDER: medication order not found'; END IF;
  IF o.patient_id <> NEW.patient_id OR o.admission_id <> NEW.admission_id THEN
    RAISE EXCEPTION 'MAR_WRONG_RESIDENT: order belongs to a different resident/admission';
  END IF;
  IF o.authenticated_at IS NULL THEN RAISE EXCEPTION 'MAR_UNVERIFIED_ORDER: order transcription not verified/signed'; END IF;
  SELECT * INTO co FROM nova_clinical_orders WHERE id = o.clinical_order_id;
  IF co.id IS NULL OR co.authenticated_at IS NULL OR co.patient_id <> o.patient_id THEN
    RAISE EXCEPTION 'MAR_UNAUTHENTICATED_ORDER: the prescriber order is not authenticated for this resident';
  END IF;
  IF co.discontinued_at IS NOT NULL THEN RAISE EXCEPTION 'MAR_INACTIVE_ORDER: prescriber order discontinued'; END IF;
  IF o.status <> 'active' THEN RAISE EXCEPTION 'MAR_INACTIVE_ORDER: order is %', o.status; END IF;

  SELECT COALESCE((SELECT facility_timezone FROM nova_chart_rules WHERE tenant_id = NEW.tenant_id), 'America/Phoenix') INTO tz;
  IF NEW.administered_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'MAR_TIME: administration time is in the future'; END IF;
  IF NEW.administered_at < now() - make_interval(hours => COALESCE((SELECT note_late_entry_hours FROM nova_chart_rules WHERE tenant_id = NEW.tenant_id), 24)) THEN
    RAISE EXCEPTION 'MAR_TOO_LATE: administrations older than the late-entry window must be documented by amendment';
  END IF;
  IF (NEW.administered_at AT TIME ZONE tz)::date < o.start_date
     OR (o.stop_date IS NOT NULL AND (NEW.administered_at AT TIME ZONE tz)::date > o.stop_date) THEN
    RAISE EXCEPTION 'MAR_OUTSIDE_ORDER_DATES: order runs % to %', o.start_date, COALESCE(o.stop_date::text,'open');
  END IF;

  is_given := NEW.outcome IN ('given','self_administered_with_assistance');
  -- what was given comes from the verified order, never free text
  NEW.medication_name := o.medication_name; NEW.strength := o.strength;
  NEW.dose_given := CASE WHEN is_given THEN o.dose ELSE '0' END;
  NEW.route := o.route;

  -- staff identity and designation come from the roster
  st := nova_staff(me);
  IF st.id IS NULL THEN RAISE EXCEPTION 'MAR_NOT_PERMITTED: you are not on the staff roster'; END IF;
  IF NEW.outcome = 'self_administered_with_assistance' THEN
    IF NOT (st.may_assist_self_administration OR st.may_administer_medication) THEN
      RAISE EXCEPTION 'MAR_NOT_PERMITTED: not permitted to assist with self-administration';
    END IF;
  ELSIF NOT st.may_administer_medication AND NOT st.may_assist_self_administration THEN
    RAISE EXCEPTION 'MAR_NOT_PERMITTED: not permitted to document medication administration';
  ELSIF NEW.outcome = 'given' AND NOT st.may_administer_medication THEN
    RAISE EXCEPTION 'MAR_NOT_PERMITTED: not permitted to administer medication';
  END IF;
  NEW.professional_designation := st.credential;
  SELECT COALESCE(display_name, email, external_subject) INTO NEW.administered_by_name FROM nova_users WHERE id = me;

  IF is_given THEN
    SELECT NOT EXISTS (SELECT 1 FROM nova_medication_administrations m
                       WHERE m.medication_order_id = o.id AND m.outcome IN ('given','self_administered_with_assistance'))
      INTO initial;
    IF (o.is_prn OR initial) AND o.is_psychotropic AND NULLIF(trim(NEW.pre_behavior_assessment),'') IS NULL THEN
      RAISE EXCEPTION 'MAR_ASSESSMENT: psychotropic given % requires a pre-administration behavior assessment',
        CASE WHEN o.is_prn THEN 'PRN' ELSE 'initially' END;
    END IF;
    IF (o.is_prn OR initial) AND o.is_pain_medication AND NULLIF(trim(NEW.pre_pain_assessment),'') IS NULL THEN
      RAISE EXCEPTION 'MAR_ASSESSMENT: pain medication given % requires a pre-administration pain assessment',
        CASE WHEN o.is_prn THEN 'PRN' ELSE 'initially' END;
    END IF;
    IF o.is_prn AND o.prn_max_doses_per_day IS NOT NULL THEN
      SELECT count(*) INTO given_today FROM nova_medication_administrations m
       WHERE m.medication_order_id = o.id AND m.outcome IN ('given','self_administered_with_assistance')
         AND (m.administered_at AT TIME ZONE tz)::date = (NEW.administered_at AT TIME ZONE tz)::date;
      IF given_today >= o.prn_max_doses_per_day THEN
        RAISE EXCEPTION 'MAR_PRN_DAILY_MAX: % of % PRN doses already given that day', given_today, o.prn_max_doses_per_day;
      END IF;
    END IF;
  END IF;
  IF NEW.authenticated_by IS NULL THEN
    RAISE EXCEPTION 'MAR_UNSIGNED: an administration must be signed when it is recorded';
  END IF;
  NEW.effect_assessment := NULL; NEW.effect_assessed_at := NULL; NEW.effect_assessed_by := NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_mar_rules ON nova_medication_administrations;
CREATE TRIGGER a_mar_rules BEFORE INSERT OR UPDATE ON nova_medication_administrations FOR EACH ROW EXECUTE FUNCTION nova_mar_rules();

-- Medication order (transcription) rules: tied to an authenticated prescriber order
-- for the same resident; verified by rostered staff.
CREATE OR REPLACE FUNCTION nova_medorder_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE co nova_clinical_orders;
BEGIN
  SELECT * INTO co FROM nova_clinical_orders WHERE id = NEW.clinical_order_id;
  IF co.id IS NULL OR co.patient_id <> NEW.patient_id OR co.admission_id <> NEW.admission_id OR co.order_kind <> 'medication' THEN
    RAISE EXCEPTION 'MEDORDER_SOURCE: must reference a medication order for the same resident and admission';
  END IF;
  IF NEW.authenticated_by IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.authenticated_by IS NULL) THEN
    IF co.authenticated_at IS NULL THEN
      RAISE EXCEPTION 'MEDORDER_UNAUTHENTICATED: prescriber must authenticate the order before it is verified';
    END IF;
    IF NOT COALESCE((nova_staff(NEW.authenticated_by)).may_verify_orders, false) THEN
      RAISE EXCEPTION 'MEDORDER_NOT_PERMITTED: verifier is not permitted to verify orders';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status_changed_by := NULL; NEW.status_changed_at := NULL;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (COALESCE((nova_staff(nova_current_user())).may_verify_orders, false) OR COALESCE((nova_staff(nova_current_user())).may_prescribe, false)) THEN
      RAISE EXCEPTION 'MEDORDER_NOT_PERMITTED: only prescribers or order-verifying staff can hold, resume or stop a medication';
    END IF;
    NEW.status_changed_by := nova_current_user(); NEW.status_changed_at := now();
    IF NEW.status IN ('discontinued','completed') AND OLD.status NOT IN ('discontinued','completed') THEN
      NEW.stop_date := COALESCE(OLD.stop_date, current_date);
    END IF;
  ELSE
    NEW.status_changed_by := OLD.status_changed_by; NEW.status_changed_at := OLD.status_changed_at;
    IF NEW.stop_date IS DISTINCT FROM OLD.stop_date AND OLD.authenticated_at IS NOT NULL
       AND NOT (COALESCE((nova_staff(nova_current_user())).may_verify_orders, false) OR COALESCE((nova_staff(nova_current_user())).may_prescribe, false)) THEN
      RAISE EXCEPTION 'MEDORDER_NOT_PERMITTED: only prescribers or order-verifying staff can set a stop date';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_medorder_rules ON nova_medication_orders;
CREATE TRIGGER a_medorder_rules BEFORE INSERT OR UPDATE ON nova_medication_orders FOR EACH ROW EXECUTE FUNCTION nova_medorder_rules();

-- Admission discharge is attested by the person who discharges (C8)
CREATE OR REPLACE FUNCTION nova_admission_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.discharged_at := NULL; NEW.discharge_authenticated_by := NULL;
    IF NEW.status = 'discharged' THEN RAISE EXCEPTION 'DISCHARGE_NOT_PERMITTED: create the admission first, then discharge it'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.status = 'discharged' AND OLD.status IS DISTINCT FROM 'discharged' THEN
    IF NOT (COALESCE((nova_staff(nova_current_user())).may_supervise, false) OR COALESCE((nova_staff(nova_current_user())).may_prescribe, false)) THEN
      RAISE EXCEPTION 'DISCHARGE_NOT_PERMITTED: only a supervisor or prescriber can discharge a resident';
    END IF;
    NEW.discharge_authenticated_by := nova_current_user();
    NEW.discharged_at := now();               -- documented time; a different actual time goes in an amendment
  ELSIF NEW.discharge_authenticated_by IS DISTINCT FROM OLD.discharge_authenticated_by
        OR NEW.discharged_at IS DISTINCT FROM OLD.discharged_at THEN
    RAISE EXCEPTION 'DISCHARGE_FORGED: discharge time and attestation are set only when discharging';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_admission_rules ON nova_admissions;
CREATE TRIGGER a_admission_rules BEFORE INSERT OR UPDATE ON nova_admissions FOR EACH ROW EXECUTE FUNCTION nova_admission_rules();

-- Amendments: real visible target for the same resident; corrections only by the author or a supervisor
CREATE OR REPLACE FUNCTION nova_amendment_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE t_patient uuid; t_author uuid; me uuid := nova_current_user();
BEGIN
  IF NEW.target_table NOT IN ('nova_clinical_notes','nova_bh_assessments','nova_treatment_plans','nova_history_physicals',
       'nova_medication_administrations','nova_emergency_safety_responses','nova_time_outs','nova_incident_reports',
       'nova_discharges','nova_consents','nova_resident_profiles','nova_admissions','nova_tb_screenings') THEN
    RAISE EXCEPTION 'AMENDMENT_TARGET: % cannot be amended', NEW.target_table;
  END IF;
  EXECUTE format('SELECT patient_id, entered_by FROM %I WHERE id = $1', NEW.target_table) INTO t_patient, t_author USING NEW.target_id;
  IF t_patient IS NULL THEN RAISE EXCEPTION 'AMENDMENT_TARGET: record not found'; END IF;
  IF t_patient <> NEW.patient_id THEN RAISE EXCEPTION 'WRONG_RESIDENT: amendment resident does not match the record'; END IF;
  IF NEW.amendment_type IN ('correction','entered_in_error') AND t_author IS DISTINCT FROM me
     AND NOT COALESCE((nova_staff(me)).may_supervise, false) THEN
    RAISE EXCEPTION 'AMENDMENT_NOT_AUTHOR: only the author or a supervisor can correct or void a record';
  END IF;
  IF NEW.authenticated_by IS NULL THEN RAISE EXCEPTION 'AMENDMENT_UNSIGNED: an amendment must be signed when entered'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_amendment_rules ON nova_chart_amendments;
CREATE TRIGGER a_amendment_rules BEFORE INSERT ON nova_chart_amendments FOR EACH ROW EXECUTE FUNCTION nova_amendment_rules();

-- 15. Emergency safety response — R9-10-712(C)
CREATE TABLE IF NOT EXISTS nova_emergency_safety_responses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 admission_id uuid NOT NULL REFERENCES nova_admissions(id),
 started_at timestamptz NOT NULL,
 ended_at timestamptz,
 behavior_leading_to_response text NOT NULL,
 less_restrictive_interventions_tried text NOT NULL,
 response_used text NOT NULL,
 staff_involved text NOT NULL,
 injuries text,
 resident_debriefed boolean,
 representative_notified_at timestamptz,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz
);

-- 16. Time-out — R9-10-712(C)
CREATE TABLE IF NOT EXISTS nova_time_outs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 admission_id uuid NOT NULL REFERENCES nova_admissions(id),
 started_at timestamptz NOT NULL,
 ended_at timestamptz,
 voluntary boolean NOT NULL,
 reason text NOT NULL,
 location text,
 observation_notes text NOT NULL,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz
);

-- 17. Incident reports (agency/ADHS reporting)
CREATE TABLE IF NOT EXISTS nova_incident_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid REFERENCES nova_patients(id),
 admission_id uuid REFERENCES nova_admissions(id),
 occurred_at timestamptz NOT NULL,
 incident_type text NOT NULL,
 description text NOT NULL,
 immediate_actions text NOT NULL,
 notifications_made text,
 external_report_required boolean NOT NULL DEFAULT false,
 external_report_ref text,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz
);

-- 18. Lab, radiology, diagnostic, consultation reports — R9-10-712(C)
CREATE TABLE IF NOT EXISTS nova_diagnostic_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 admission_id uuid REFERENCES nova_admissions(id),
 clinical_order_id uuid REFERENCES nova_clinical_orders(id),
 report_type text NOT NULL CHECK (report_type IN ('laboratory','radiology','diagnostic','consultation')),
 source text NOT NULL,
 resulted_on date NOT NULL,
 summary text,
 document_ref text NOT NULL,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),        -- reviewed by
 authenticated_at timestamptz
);

-- 19. Discharge plan, disposition, discharge summary — R9-10-712(C)
CREATE TABLE IF NOT EXISTS nova_discharges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 admission_id uuid NOT NULL UNIQUE REFERENCES nova_admissions(id),
 discharge_plan text NOT NULL,
 aftercare_appointments text,
 medications_at_discharge text,
 disposition text,                       -- where the resident went
 discharge_summary text,
 discharged_at timestamptz,
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),
 authenticated_at timestamptz,
 CHECK (authenticated_by IS NULL OR (disposition IS NOT NULL AND discharged_at IS NOT NULL))
);

-- ---------------------------------------------------------------------
-- 20. AHCCCS claim records (837P/837I data; transmission via clearinghouse)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nova_payer_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 payer_name text NOT NULL,                 -- e.g., Mercy Care, Arizona Complete Health, Care1st
 clearinghouse text,
 clearinghouse_payer_id text,
 claim_format text NOT NULL DEFAULT '837P' CHECK (claim_format IN ('837P','837I')),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id, payer_name)
);

CREATE TABLE IF NOT EXISTS nova_claims (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 admission_id uuid NOT NULL REFERENCES nova_admissions(id),
 payer_plan_id uuid NOT NULL REFERENCES nova_payer_plans(id),
 claim_format text NOT NULL DEFAULT '837P' CHECK (claim_format IN ('837P','837I')),
 member_id text NOT NULL,
 billing_provider_npi text NOT NULL CHECK (billing_provider_npi ~ '^[0-9]{10}$'),
 billing_provider_tax_id text,
 rendering_provider_npi text CHECK (rendering_provider_npi IS NULL OR rendering_provider_npi ~ '^[0-9]{10}$'),
 place_of_service text,
 diagnosis_codes text[] NOT NULL,
 prior_authorization_number text,
 statement_from date NOT NULL,
 statement_to date NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','submitted','accepted','rejected','paid','denied','void')),
 clearinghouse_claim_ref text,
 payer_claim_number text,
 total_charge numeric(12,2) NOT NULL DEFAULT 0,
 paid_amount numeric(12,2),
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (statement_to >= statement_from),
 CHECK (COALESCE(array_length(diagnosis_codes,1),0) BETWEEN 1 AND 12)
);

CREATE TABLE IF NOT EXISTS nova_claim_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 claim_id uuid NOT NULL REFERENCES nova_claims(id),
 line_number integer NOT NULL,
 service_date date NOT NULL,
 procedure_code text NOT NULL,             -- HCPCS/CPT, or revenue code for 837I
 modifiers text[] NOT NULL DEFAULT '{}',
 units numeric(8,2) NOT NULL CHECK (units > 0),
 charge numeric(12,2) NOT NULL CHECK (charge >= 0),
 diagnosis_pointers integer[] NOT NULL DEFAULT '{1}',
 supporting_note_id uuid REFERENCES nova_clinical_notes(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (claim_id, line_number)
);

-- Pre-submission checks: every line must be backed by signed documentation
CREATE OR REPLACE FUNCTION nova_claim_validate(p_claim_id uuid)
RETURNS TABLE(severity text, line_number integer, issue text)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT 'error', NULL::integer, 'Claim has no service lines'
  WHERE NOT EXISTS (SELECT 1 FROM nova_claim_lines WHERE claim_id = p_claim_id)
  UNION ALL
  SELECT 'error', l.line_number, 'Service date outside statement period'
  FROM nova_claim_lines l JOIN nova_claims c ON c.id = l.claim_id
  WHERE l.claim_id = p_claim_id AND (l.service_date < c.statement_from OR l.service_date > c.statement_to)
  UNION ALL
  SELECT 'error', l.line_number, 'No supporting clinical note linked'
  FROM nova_claim_lines l WHERE l.claim_id = p_claim_id AND l.supporting_note_id IS NULL
  UNION ALL
  SELECT 'error', l.line_number, 'Supporting note is not signed'
  FROM nova_claim_lines l JOIN nova_clinical_notes n ON n.id = l.supporting_note_id
  WHERE l.claim_id = p_claim_id AND n.authenticated_at IS NULL
  UNION ALL
  SELECT 'error', l.line_number, 'Supporting note date does not match service date'
  FROM nova_claim_lines l JOIN nova_clinical_notes n ON n.id = l.supporting_note_id
  WHERE l.claim_id = p_claim_id AND n.service_date <> l.service_date
  UNION ALL
  SELECT 'error', l.line_number, 'Supporting note belongs to a different resident'
  FROM nova_claim_lines l JOIN nova_clinical_notes n ON n.id = l.supporting_note_id
  JOIN nova_claims c ON c.id = l.claim_id
  WHERE l.claim_id = p_claim_id AND n.patient_id <> c.patient_id
  UNION ALL
  SELECT 'warning', l.line_number, 'Note requires cosign that has not been applied'
  FROM nova_claim_lines l JOIN nova_clinical_notes n ON n.id = l.supporting_note_id
  WHERE l.claim_id = p_claim_id AND n.requires_cosign AND n.cosigned_at IS NULL
  UNION ALL
  SELECT 'error', l.line_number, 'Diagnosis pointer out of range'
  FROM nova_claim_lines l JOIN nova_claims c ON c.id = l.claim_id
  WHERE l.claim_id = p_claim_id
    AND EXISTS (SELECT 1 FROM unnest(l.diagnosis_pointers) p WHERE p < 1 OR p > array_length(c.diagnosis_codes,1))
$$;

-- ---------------------------------------------------------------------
-- Attach guard + audit to every signed chart table
-- ---------------------------------------------------------------------
DO $attach$ BEGIN
  PERFORM nova_chart_attach('nova_resident_profiles');
  PERFORM nova_chart_attach('nova_resident_allergies');
  PERFORM nova_chart_attach('nova_admissions', ARRAY['status=pending>active,active>discharged,pending>cancelled','discharged_at','discharge_authenticated_by']);
  PERFORM nova_chart_attach('nova_resident_representatives', ARRAY['active=true>false']);
  PERFORM nova_chart_attach('nova_consents', ARRAY['revoked_on']);
  PERFORM nova_chart_attach('nova_health_care_directives');
  PERFORM nova_chart_attach('nova_history_physicals');
  PERFORM nova_chart_attach('nova_tb_screenings');
  PERFORM nova_chart_attach('nova_bh_assessments');
  PERFORM nova_chart_attach('nova_treatment_plans', ARRAY['status=draft>active,active>superseded']);
  PERFORM nova_chart_attach('nova_treatment_plan_goals', ARRAY['status=active>met,active>revised,active>discontinued']);
  PERFORM nova_chart_attach('nova_clinical_notes', ARRAY['cosigned_by','cosigned_at']);
  PERFORM nova_chart_attach('nova_chart_amendments');
  PERFORM nova_chart_attach('nova_clinical_orders', ARRAY['discontinued_at','discontinued_by']);
  PERFORM nova_chart_attach('nova_medication_orders', ARRAY['status=active>held,held>active,active>discontinued,held>discontinued,active>completed','stop_date','~status_changed_by','~status_changed_at']);
  PERFORM nova_chart_attach('nova_medication_administrations',
    ARRAY['effect_assessment','effect_assessed_at','effect_assessed_by','adverse_reaction']);
  PERFORM nova_chart_attach('nova_emergency_safety_responses', ARRAY['representative_notified_at','resident_debriefed']);
  PERFORM nova_chart_attach('nova_time_outs');
  PERFORM nova_chart_attach('nova_incident_reports', ARRAY['external_report_ref']);
  PERFORM nova_chart_attach('nova_diagnostic_reports');
  PERFORM nova_chart_attach('nova_discharges');
END $attach$;

-- Claims are not "signed" records, but every change is audited
DROP TRIGGER IF EXISTS zz_chart_audit ON nova_claims;
CREATE TRIGGER zz_chart_audit AFTER INSERT OR UPDATE OR DELETE ON nova_claims FOR EACH ROW EXECUTE FUNCTION nova_chart_audit_fn();
DROP TRIGGER IF EXISTS zz_chart_audit ON nova_claim_lines;
CREATE TRIGGER zz_chart_audit AFTER INSERT OR UPDATE OR DELETE ON nova_claim_lines FOR EACH ROW EXECUTE FUNCTION nova_chart_audit_fn();

-- ---------------------------------------------------------------------
-- 21. ARTICLE 7 COMPLETENESS CHECK (per admission)
-- status: ok | missing | overdue | needs_signature | not_applicable
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nova_chart_completeness(p_admission_id uuid)
RETURNS TABLE(requirement_code text, citation text, requirement text, status text, detail text)
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  a nova_admissions; p nova_resident_profiles; rules nova_chart_rules;
  n integer; u integer;
BEGIN
  SELECT * INTO a FROM nova_admissions WHERE id = p_admission_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'ADMISSION_NOT_FOUND_OR_NOT_VISIBLE'; END IF;
  SELECT * INTO p FROM nova_resident_profiles WHERE patient_id = a.patient_id;
  SELECT * INTO rules FROM nova_chart_rules WHERE tenant_id = a.tenant_id;
  IF rules.tenant_id IS NULL THEN rules.tb_clearance_days := 7; END IF;

  RETURN QUERY SELECT 'IDENTIFICATION','R9-10-712(C)','Name, address, date of birth',
    CASE WHEN p.id IS NULL OR p.address_line1 IS NULL THEN 'missing'
         WHEN p.authenticated_at IS NULL THEN 'needs_signature' ELSE 'ok' END,
    CASE WHEN p.id IS NULL THEN 'No resident profile' WHEN p.address_line1 IS NULL THEN 'Address not recorded' END;

  SELECT count(*), count(*) FILTER (WHERE authenticated_at IS NULL) INTO n, u
    FROM nova_resident_allergies WHERE patient_id = a.patient_id AND status = 'active';
  RETURN QUERY SELECT 'ALLERGIES','R9-10-712(C)','Known allergies, including medication allergies',
    CASE WHEN n = 0 AND NOT COALESCE(p.allergies_reviewed,false) THEN 'missing'
         WHEN u > 0 THEN 'needs_signature' ELSE 'ok' END,
    CASE WHEN n = 0 AND COALESCE(p.allergies_reviewed,false) THEN 'No known allergies (reviewed)' ELSE n || ' active allergy record(s)' END;

  RETURN QUERY SELECT 'ADMISSION','R9-10-712(C)','Admitting professional, admitting diagnosis/presenting issues, admission date',
    CASE WHEN a.authenticated_at IS NULL THEN 'needs_signature' ELSE 'ok' END, NULL::text;

  RETURN QUERY SELECT 'DISCHARGE_DATE','R9-10-712(C)','Discharge date',
    CASE WHEN a.status <> 'discharged' THEN 'not_applicable'
         WHEN a.discharged_at IS NULL THEN 'missing' ELSE 'ok' END, NULL::text;

  SELECT count(*) INTO n FROM nova_resident_representatives WHERE patient_id = a.patient_id AND active;
  RETURN QUERY SELECT 'REPRESENTATIVE','R9-10-712(C)','Representative contact and authority document',
    CASE WHEN n = 0 THEN 'not_applicable'
         WHEN EXISTS (SELECT 1 FROM nova_resident_representatives r WHERE r.patient_id = a.patient_id AND r.active AND r.authenticated_at IS NULL)
           THEN 'needs_signature' ELSE 'ok' END,
    CASE WHEN n = 0 THEN 'No representative on file' END;

  RETURN QUERY SELECT 'GENERAL_CONSENT','R9-10-712(C)','General consent',
    CASE WHEN NOT EXISTS (SELECT 1 FROM nova_consents c WHERE c.patient_id = a.patient_id AND c.consent_type = 'general' AND c.revoked_on IS NULL)
           THEN 'missing'
         WHEN NOT EXISTS (SELECT 1 FROM nova_consents c WHERE c.patient_id = a.patient_id AND c.consent_type = 'general' AND c.revoked_on IS NULL AND c.authenticated_at IS NOT NULL)
           THEN 'needs_signature' ELSE 'ok' END, NULL::text;

  RETURN QUERY SELECT 'INFORMED_CONSENT_PSYCHOTROPIC','R9-10-712(C)','Informed consent for psychotropic medication',
    CASE WHEN NOT EXISTS (SELECT 1 FROM nova_medication_orders m WHERE m.admission_id = a.id AND m.is_psychotropic) THEN 'not_applicable'
         WHEN NOT EXISTS (SELECT 1 FROM nova_consents c WHERE c.patient_id = a.patient_id AND c.consent_type = 'informed_psychotropic'
                          AND c.revoked_on IS NULL AND c.authenticated_at IS NOT NULL) THEN 'missing'
         ELSE 'ok' END, NULL::text;

  RETURN QUERY SELECT 'HISTORY_PHYSICAL','R9-10-712(C)','Medical history and physical examination',
    CASE WHEN NOT EXISTS (SELECT 1 FROM nova_history_physicals h WHERE h.patient_id = a.patient_id) THEN 'missing'
         WHEN NOT EXISTS (SELECT 1 FROM nova_history_physicals h WHERE h.patient_id = a.patient_id AND h.authenticated_at IS NOT NULL) THEN 'needs_signature'
         ELSE 'ok' END, NULL::text;

  RETURN QUERY SELECT 'HEALTH_CARE_DIRECTIVE','R9-10-712(C)','Copy of health care directive, if applicable',
    CASE WHEN NOT COALESCE(p.has_health_care_directive,false) THEN 'not_applicable'
         WHEN NOT EXISTS (SELECT 1 FROM nova_health_care_directives d WHERE d.patient_id = a.patient_id) THEN 'missing'
         ELSE 'ok' END, NULL::text;

  RETURN QUERY SELECT 'COURT_ORDER','R9-10-712(C)','Court-ordered evaluation/treatment documentation, if applicable',
    CASE WHEN NOT a.court_ordered THEN 'not_applicable' WHEN a.court_order_reference IS NULL THEN 'missing' ELSE 'ok' END, NULL::text;

  RETURN QUERY SELECT 'BH_ASSESSMENT','R9-10-707','Behavioral health assessment',
    CASE WHEN NOT EXISTS (SELECT 1 FROM nova_bh_assessments b WHERE b.admission_id = a.id) THEN 'missing'
         WHEN NOT EXISTS (SELECT 1 FROM nova_bh_assessments b WHERE b.admission_id = a.id AND b.authenticated_at IS NOT NULL) THEN 'needs_signature'
         ELSE 'ok' END, NULL::text;

  RETURN QUERY SELECT 'TREATMENT_PLAN','R9-10-708','Treatment plan with goals',
    CASE WHEN NOT EXISTS (SELECT 1 FROM nova_treatment_plans t WHERE t.admission_id = a.id) THEN 'missing'
         WHEN NOT EXISTS (SELECT 1 FROM nova_treatment_plans t WHERE t.admission_id = a.id AND t.status = 'active' AND t.authenticated_at IS NOT NULL) THEN 'needs_signature'
         WHEN NOT EXISTS (SELECT 1 FROM nova_treatment_plans t JOIN nova_treatment_plan_goals g ON g.treatment_plan_id = t.id
                          WHERE t.admission_id = a.id AND t.status = 'active') THEN 'missing'
         WHEN EXISTS (SELECT 1 FROM nova_treatment_plans t WHERE t.admission_id = a.id AND t.status = 'active' AND t.review_due_on < current_date) THEN 'overdue'
         ELSE 'ok' END,
    (SELECT 'Review due ' || t.review_due_on FROM nova_treatment_plans t WHERE t.admission_id = a.id AND t.status = 'active' ORDER BY version DESC LIMIT 1);

  SELECT count(*), count(*) FILTER (WHERE authenticated_at IS NULL) INTO n, u FROM nova_clinical_notes WHERE admission_id = a.id;
  RETURN QUERY SELECT 'PROGRESS_NOTES','R9-10-712(C)','Progress notes / documentation of services provided',
    CASE WHEN n = 0 THEN 'missing' WHEN u > 0 THEN 'needs_signature' ELSE 'ok' END,
    n || ' note(s), ' || u || ' unsigned';

  RETURN QUERY SELECT 'TB_CLEARANCE','R9-10-707','Freedom from infectious TB within ' || rules.tb_clearance_days || ' days of admission',
    CASE WHEN EXISTS (SELECT 1 FROM nova_tb_screenings t WHERE t.patient_id = a.patient_id
                      AND t.result IN ('negative','positive_cleared','exempt') AND t.authenticated_at IS NOT NULL
                      AND t.performed_on >= (a.admitted_at::date - 365)) THEN 'ok'
         WHEN current_date > a.admitted_at::date + rules.tb_clearance_days THEN 'overdue'
         ELSE 'missing' END,
    'Due by ' || (a.admitted_at::date + rules.tb_clearance_days);

  SELECT count(*) INTO n FROM nova_medication_administrations m WHERE m.admission_id = a.id AND m.authenticated_at IS NULL;
  RETURN QUERY SELECT 'MAR_SIGNED','R9-10-712(C)','Each administration signed by staff with professional designation',
    CASE WHEN NOT EXISTS (SELECT 1 FROM nova_medication_orders mo WHERE mo.admission_id = a.id) THEN 'not_applicable'
         WHEN n > 0 THEN 'needs_signature' ELSE 'ok' END, n || ' unsigned administration(s)';

  SELECT count(*) INTO n FROM nova_medication_administrations m JOIN nova_medication_orders mo ON mo.id = m.medication_order_id
    WHERE m.admission_id = a.id AND mo.is_prn AND (mo.is_psychotropic OR mo.is_pain_medication)
      AND m.outcome IN ('given','self_administered_with_assistance') AND m.effect_assessment IS NULL;
  RETURN QUERY SELECT 'MAR_PRN_EFFECT','R9-10-712(C)','Effect of PRN pain/psychotropic medication documented',
    CASE WHEN NOT EXISTS (SELECT 1 FROM nova_medication_orders mo WHERE mo.admission_id = a.id AND mo.is_prn) THEN 'not_applicable'
         WHEN n > 0 THEN 'missing' ELSE 'ok' END, n || ' PRN dose(s) without effect';

  SELECT count(*) INTO n FROM nova_clinical_orders o WHERE o.admission_id = a.id AND o.authenticated_at IS NULL;
  RETURN QUERY SELECT 'ORDERS_AUTHENTICATED','R9-10-712(A)(3)','Orders authenticated by issuing practitioner',
    CASE WHEN NOT EXISTS (SELECT 1 FROM nova_clinical_orders o WHERE o.admission_id = a.id) THEN 'not_applicable'
         WHEN n > 0 THEN 'needs_signature' ELSE 'ok' END, n || ' unauthenticated order(s)';

  SELECT count(*) INTO n FROM (
     SELECT authenticated_at FROM nova_emergency_safety_responses WHERE admission_id = a.id
     UNION ALL SELECT authenticated_at FROM nova_time_outs WHERE admission_id = a.id) x WHERE authenticated_at IS NULL;
  RETURN QUERY SELECT 'SAFETY_EVENTS','R9-10-712(C)','Emergency safety responses and time-outs documented and signed',
    CASE WHEN NOT EXISTS (SELECT 1 FROM nova_emergency_safety_responses WHERE admission_id = a.id)
              AND NOT EXISTS (SELECT 1 FROM nova_time_outs WHERE admission_id = a.id) THEN 'not_applicable'
         WHEN n > 0 THEN 'needs_signature' ELSE 'ok' END, NULL::text;

  SELECT count(*) INTO n FROM nova_diagnostic_reports d WHERE d.admission_id = a.id AND d.authenticated_at IS NULL;
  RETURN QUERY SELECT 'DIAGNOSTIC_REPORTS','R9-10-712(C)','Lab, radiology, diagnostic, consultation reports reviewed',
    CASE WHEN NOT EXISTS (SELECT 1 FROM nova_diagnostic_reports d WHERE d.admission_id = a.id) THEN 'not_applicable'
         WHEN n > 0 THEN 'needs_signature' ELSE 'ok' END, NULL::text;

  RETURN QUERY SELECT 'DISCHARGE_PLAN','R9-10-712(C)','Discharge plan',
    CASE WHEN EXISTS (SELECT 1 FROM nova_discharges d WHERE d.admission_id = a.id) THEN 'ok'
         WHEN a.status = 'discharged' THEN 'missing' ELSE 'not_applicable' END,
    CASE WHEN a.status <> 'discharged' THEN 'Start before discharge' END;

  RETURN QUERY SELECT 'DISPOSITION_SUMMARY','R9-10-712(C)','Disposition after discharge and discharge summary',
    CASE WHEN a.status <> 'discharged' THEN 'not_applicable'
         WHEN NOT EXISTS (SELECT 1 FROM nova_discharges d WHERE d.admission_id = a.id AND d.disposition IS NOT NULL AND d.discharge_summary IS NOT NULL) THEN 'missing'
         WHEN NOT EXISTS (SELECT 1 FROM nova_discharges d WHERE d.admission_id = a.id AND d.authenticated_at IS NOT NULL) THEN 'needs_signature'
         ELSE 'ok' END, NULL::text;
END $$;

-- Chart-level summary for dashboards
DROP VIEW IF EXISTS nova_chart_status;
CREATE VIEW nova_chart_status WITH (security_invoker = true) AS
SELECT a.tenant_id, a.id AS admission_id, a.patient_id,
       rp.legal_last_name || ', ' || rp.legal_first_name AS resident_name,
       a.status, a.admitted_at,
       c.items_missing, c.items_unsigned
FROM nova_admissions a
LEFT JOIN nova_resident_profiles rp ON rp.patient_id = a.patient_id
CROSS JOIN LATERAL (
  SELECT count(*) FILTER (WHERE x.status IN ('missing','overdue')) AS items_missing,
         count(*) FILTER (WHERE x.status = 'needs_signature') AS items_unsigned
  FROM nova_chart_completeness(a.id) x) c;

-- Note writing queue: unsigned and late notes
CREATE OR REPLACE VIEW nova_note_queue WITH (security_invoker = true) AS
SELECT n.tenant_id, n.id AS note_id, n.patient_id, n.admission_id, n.note_type, n.service_date,
       n.entered_by, n.ai_drafted, n.authenticated_at,
       (n.authenticated_at IS NULL) AS unsigned,
       (n.requires_cosign AND n.cosigned_at IS NULL) AS awaiting_cosign,
       (n.created_at > (n.service_date + 1)::timestamptz
          + make_interval(hours => COALESCE((SELECT r.note_late_entry_hours FROM nova_chart_rules r WHERE r.tenant_id = n.tenant_id), 24))) AS late_entry
FROM nova_clinical_notes n;
