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
-- Session identity helpers (work in plain Postgres and in Supabase)
-- Plain Postgres / server code:  SET app.tenant_id = '...'; SET app.user_id = '...';
-- Supabase: put tenant_id and nova_user_id in the JWT (app_metadata).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nova_jwt_claim(p_key text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> p_key,
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> p_key)
$$;

CREATE OR REPLACE FUNCTION nova_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.tenant_id', true), ''),
                  nova_jwt_claim('tenant_id'))::uuid
$$;

CREATE OR REPLACE FUNCTION nova_current_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.user_id', true), ''),
                  nova_jwt_claim('nova_user_id'))::uuid
$$;

-- ---------------------------------------------------------------------
-- Rule settings (per tenant, so they follow the agency's P&P)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nova_chart_rules (
 tenant_id uuid PRIMARY KEY REFERENCES nova_tenants(id),
 tb_clearance_days integer NOT NULL DEFAULT 7,          -- R9-10-707: before or within 7 calendar days of admission
 note_late_entry_hours integer NOT NULL DEFAULT 24,      -- agency policy
 record_retrieval_max_hours integer NOT NULL DEFAULT 24, -- R9-10-712(A)(6): agency must set this
 require_note_cosign_roles text[] NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now()
);

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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb := to_jsonb(COALESCE(NEW, OLD));
BEGIN
  INSERT INTO nova_chart_audit(tenant_id, table_name, row_id, operation, actor_user_id, old_row, new_row)
  VALUES ((r->>'tenant_id')::uuid, TG_TABLE_NAME, (r->>'id')::uuid, TG_OP, nova_current_user(),
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
LANGUAGE plpgsql AS $$
DECLARE
  allow text[] := COALESCE(TG_ARGV::text[], '{}') || ARRAY['updated_at'];
  k text;
  me uuid := nova_current_user();
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.authenticated_at IS NOT NULL THEN
      RAISE EXCEPTION 'CHART_LOCKED: signed % record % cannot be deleted; file an amendment', TG_TABLE_NAME, OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    IF NEW.entered_by IS NULL THEN NEW.entered_by := me; END IF;
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
  NEW.created_at := OLD.created_at;
  NEW.entered_by := OLD.entered_by;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'CHART_IDENTITY: id and tenant cannot change';
  END IF;

  IF OLD.authenticated_at IS NOT NULL THEN
    NEW.authenticated_by := OLD.authenticated_by;
    NEW.authenticated_at := OLD.authenticated_at;
    IF (to_jsonb(NEW) - allow) IS DISTINCT FROM (to_jsonb(OLD) - allow) THEN
      RAISE EXCEPTION 'CHART_LOCKED: % record % is signed; file an amendment instead', TG_TABLE_NAME, OLD.id;
    END IF;
    FOREACH k IN ARRAY allow LOOP
      IF k <> 'updated_at' AND (to_jsonb(OLD)->>k) IS NOT NULL
         AND (to_jsonb(OLD)->k) IS DISTINCT FROM (to_jsonb(NEW)->k) THEN
        RAISE EXCEPTION 'CHART_LOCKED: % already recorded on % %', k, TG_TABLE_NAME, OLD.id;
      END IF;
    END LOOP;
    RETURN NEW;
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
LANGUAGE plpgsql AS $$
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
LANGUAGE plpgsql AS $$
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
LANGUAGE plpgsql AS $$
DECLARE me uuid := nova_current_user();
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.cosigned_by IS NULL AND NEW.cosigned_by IS NOT NULL THEN
    IF OLD.authenticated_at IS NULL THEN RAISE EXCEPTION 'COSIGN_BEFORE_SIGN: author must sign first'; END IF;
    IF NEW.cosigned_by <> me THEN RAISE EXCEPTION 'SIGNATURE_NOT_OWN: cosigner must be the signed-in user'; END IF;
    IF NEW.cosigned_by = OLD.authenticated_by THEN RAISE EXCEPTION 'COSIGN_SELF: author cannot cosign own note'; END IF;
    NEW.cosigned_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_note_rules ON nova_clinical_notes;
CREATE TRIGGER a_note_rules BEFORE UPDATE ON nova_clinical_notes FOR EACH ROW EXECUTE FUNCTION nova_note_rules();

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
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.authenticated_by IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.authenticated_by IS NULL)
     AND NEW.authenticated_by IS DISTINCT FROM NEW.issuing_practitioner_user_id THEN
    RAISE EXCEPTION 'ORDER_AUTH: an order must be authenticated by the practitioner who issued it';
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
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),        -- transcription verified by
 authenticated_at timestamptz,
 CHECK (NOT is_prn OR prn_indication IS NOT NULL)
);

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
 administered_by_name text NOT NULL,
 professional_designation text NOT NULL,                  -- e.g., RN, LPN, BHT
 entered_by uuid REFERENCES nova_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_by uuid REFERENCES nova_users(id),         -- signature of administering staff
 authenticated_at timestamptz,
 CHECK (outcome IN ('given','self_administered_with_assistance') OR reason_not_given IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_mar_adm ON nova_medication_administrations(tenant_id, admission_id, administered_at);

CREATE OR REPLACE FUNCTION nova_mar_rules() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE o nova_medication_orders; initial boolean;
BEGIN
  SELECT * INTO o FROM nova_medication_orders WHERE id = NEW.medication_order_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'MAR_ORDER: medication order not found'; END IF;
  IF o.patient_id <> NEW.patient_id OR o.admission_id <> NEW.admission_id THEN
    RAISE EXCEPTION 'MAR_WRONG_RESIDENT: order belongs to a different resident/admission';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF o.authenticated_at IS NULL THEN RAISE EXCEPTION 'MAR_UNVERIFIED_ORDER: order transcription not verified/signed'; END IF;
    IF o.status <> 'active' THEN RAISE EXCEPTION 'MAR_INACTIVE_ORDER: order is %', o.status; END IF;
    NEW.medication_name := o.medication_name; NEW.strength := o.strength; NEW.route := COALESCE(NEW.route, o.route);
    IF NEW.outcome IN ('given','self_administered_with_assistance') THEN
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
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.effect_assessment IS NULL AND NEW.effect_assessment IS NOT NULL THEN
    NEW.effect_assessed_at := now();
    NEW.effect_assessed_by := nova_current_user();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_mar_rules ON nova_medication_administrations;
CREATE TRIGGER a_mar_rules BEFORE INSERT OR UPDATE ON nova_medication_administrations FOR EACH ROW EXECUTE FUNCTION nova_mar_rules();

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
LANGUAGE sql STABLE AS $$
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
  PERFORM nova_chart_attach('nova_admissions', ARRAY['status','discharged_at','discharge_authenticated_by']);
  PERFORM nova_chart_attach('nova_resident_representatives', ARRAY['active']);
  PERFORM nova_chart_attach('nova_consents', ARRAY['revoked_on']);
  PERFORM nova_chart_attach('nova_health_care_directives');
  PERFORM nova_chart_attach('nova_history_physicals');
  PERFORM nova_chart_attach('nova_tb_screenings');
  PERFORM nova_chart_attach('nova_bh_assessments');
  PERFORM nova_chart_attach('nova_treatment_plans', ARRAY['status']);
  PERFORM nova_chart_attach('nova_treatment_plan_goals', ARRAY['status']);
  PERFORM nova_chart_attach('nova_clinical_notes', ARRAY['cosigned_by','cosigned_at']);
  PERFORM nova_chart_attach('nova_chart_amendments');
  PERFORM nova_chart_attach('nova_clinical_orders', ARRAY['discontinued_at']);
  PERFORM nova_chart_attach('nova_medication_orders', ARRAY['status','stop_date']);
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
LANGUAGE plpgsql STABLE AS $$
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
CREATE OR REPLACE VIEW nova_chart_status WITH (security_invoker = true) AS
SELECT a.tenant_id, a.id AS admission_id, a.patient_id,
       rp.legal_last_name || ', ' || rp.legal_first_name AS resident_name,
       a.status, a.admitted_at,
       (SELECT count(*) FROM nova_chart_completeness(a.id) c WHERE c.status IN ('missing','overdue')) AS items_missing,
       (SELECT count(*) FROM nova_chart_completeness(a.id) c WHERE c.status = 'needs_signature') AS items_unsigned
FROM nova_admissions a
LEFT JOIN nova_resident_profiles rp ON rp.patient_id = a.patient_id;

-- Note writing queue: unsigned and late notes
CREATE OR REPLACE VIEW nova_note_queue WITH (security_invoker = true) AS
SELECT n.tenant_id, n.id AS note_id, n.patient_id, n.admission_id, n.note_type, n.service_date,
       n.entered_by, n.ai_drafted, n.authenticated_at,
       (n.authenticated_at IS NULL) AS unsigned,
       (n.requires_cosign AND n.cosigned_at IS NULL) AS awaiting_cosign,
       (n.created_at > (n.service_date + 1)::timestamptz
          + make_interval(hours => COALESCE((SELECT r.note_late_entry_hours FROM nova_chart_rules r WHERE r.tenant_id = n.tenant_id), 24))) AS late_entry
FROM nova_clinical_notes n;
