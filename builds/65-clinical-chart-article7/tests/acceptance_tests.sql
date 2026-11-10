-- =====================================================================
-- Acceptance tests: Build 65 (clinical chart) + Build 66 (RLS)
-- Run as a superuser on a TEST database after all builds are applied:
--   psql -v ON_ERROR_STOP=1 -f acceptance_tests.sql
-- Every check runs as the restricted app role (nova_app), so row-level
-- security is genuinely enforced. Results print as PASS/FAIL.
-- =====================================================================
SET client_min_messages = warning;

DROP TABLE IF EXISTS nova_test_results;
CREATE TABLE nova_test_results (n serial, test text, result text, detail text);
GRANT ALL ON nova_test_results TO nova_app;
GRANT USAGE ON SEQUENCE nova_test_results_n_seq TO nova_app;

CREATE OR REPLACE FUNCTION t_ok(p_test text, p_cond boolean, p_detail text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  INSERT INTO nova_test_results(test,result,detail) VALUES (p_test, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

CREATE OR REPLACE FUNCTION t_err(p_test text, p_sql text, p_expect text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  EXECUTE p_sql;
  INSERT INTO nova_test_results(test,result,detail) VALUES (p_test,'FAIL','statement succeeded; expected error containing '||p_expect);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO nova_test_results(test,result,detail)
  VALUES (p_test, CASE WHEN SQLERRM ILIKE '%'||p_expect||'%' THEN 'PASS' ELSE 'FAIL' END, SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION t_as(p_tenant uuid, p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  PERFORM set_config('app.tenant_id', p_tenant::text, false);
  PERFORM set_config('app.user_id', p_user::text, false);
END $$;
GRANT EXECUTE ON FUNCTION t_ok(text,boolean,text), t_err(text,text,text), t_as(uuid,uuid) TO nova_app;

-- ---------------------------------------------------------------- reset test tenants (superuser)
-- Test data only: chart locks are bypassed here so the suite can be re-run.
SET session_replication_role = replica;
DO $reset$
DECLARE t record; ids uuid[] := ARRAY['a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b']::uuid[];
BEGIN
  DELETE FROM nova_document_signatures WHERE document_id IN
    (SELECT id FROM nova_document_instances WHERE tenant_id = ANY(ids));
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r'
             AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id') LOOP
    EXECUTE format('DELETE FROM %I WHERE tenant_id = ANY($1)', t.relname) USING ids;
  END LOOP;
  DELETE FROM nova_tenants WHERE id = ANY(ids);
END $reset$;
SET session_replication_role = origin;

-- ---------------------------------------------------------------- seed (superuser)
INSERT INTO nova_tenants(id,tenant_key,name) VALUES
 ('a0000000-0000-0000-0000-00000000000a','test-ach','Test ACH'),
 ('b0000000-0000-0000-0000-00000000000b','test-other','Other Agency')
ON CONFLICT (id) DO NOTHING;
INSERT INTO nova_users(id,tenant_id,external_subject,display_name) VALUES
 ('a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','dr','Dr. Prescriber (A)'),
 ('a1000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','rn','Nurse (A)'),
 ('a1000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-00000000000a','bht','BHT (A)'),
 ('b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','other','Staff (B)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO nova_patients(id,tenant_id,external_patient_key) VALUES
 ('a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','A-1'),
 ('a2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','A-2'),
 ('b2000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','B-1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO nova_document_instances(id,tenant_id,document_type,title) VALUES
 ('a3000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','form','A doc'),
 ('b3000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','form','B doc')
ON CONFLICT (id) DO NOTHING;
INSERT INTO nova_document_signatures(document_id,signature_type,status) VALUES
 ('a3000000-0000-0000-0000-000000000001','electronic','signed'),
 ('b3000000-0000-0000-0000-000000000001','electronic','signed');
INSERT INTO nova_admissions(id,tenant_id,patient_id,admitted_at,admitting_professional_name,admitting_professional_credential,presenting_issues)
VALUES ('b4000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','b2000000-0000-0000-0000-000000000001',
        now(),'Other Doc','MD','B resident')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------- run as app role
SET ROLE nova_app;

-- T1 tenant isolation ---------------------------------------------------
SELECT t_as('a0000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000002');
SELECT t_ok('T1.1 tenant A sees only its own patients', (SELECT count(*) FROM nova_patients) = 2,
            (SELECT count(*) FROM nova_patients)::text || ' visible');
SELECT t_ok('T1.2 tenant A cannot see tenant B admission', NOT EXISTS (SELECT 1 FROM nova_admissions WHERE id='b4000000-0000-0000-0000-000000000001'));
SELECT t_err('T1.3 cannot insert a row into another tenant',
  $q$INSERT INTO nova_patients(tenant_id,external_patient_key) VALUES ('b0000000-0000-0000-0000-00000000000b','sneak')$q$, 'row-level security');
SELECT t_ok('T1.4 child table without tenant_id is isolated (document signatures)',
  (SELECT count(*) FROM nova_document_signatures) = 1);
SELECT t_ok('T1.5 only own tenant row visible in nova_tenants', (SELECT count(*) FROM nova_tenants) = 1);
SELECT t_err('T1.6 platform-only tables are closed to app users', $q$SELECT * FROM nova_release_manifests$q$, 'permission denied');
SELECT t_err('T1.7 audit log cannot be written directly',
  $q$INSERT INTO nova_chart_audit(tenant_id,table_name,operation) VALUES ('a0000000-0000-0000-0000-00000000000a','x','INSERT')$q$, 'permission denied');

-- T2 chart creation, server clock --------------------------------------
INSERT INTO nova_resident_profiles(tenant_id,patient_id,legal_first_name,legal_last_name,date_of_birth,address_line1,city,state,postal_code,allergies_reviewed,created_at)
VALUES ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001','Jordan','Rivera','1990-04-12',
        '142 E Joan D Arc Ave','Phoenix','AZ','85022',true,'2001-01-01');
SELECT t_ok('T2.1 client-supplied created_at is replaced by the database clock',
  (SELECT created_at > now() - interval '1 minute' FROM nova_resident_profiles WHERE patient_id='a2000000-0000-0000-0000-000000000001'));
SELECT t_ok('T2.2 entered_by comes from the session user',
  (SELECT entered_by = 'a1000000-0000-0000-0000-000000000002' FROM nova_resident_profiles WHERE patient_id='a2000000-0000-0000-0000-000000000001'));

INSERT INTO nova_admissions(id,tenant_id,patient_id,admitted_at,admitting_professional_user_id,admitting_professional_name,
  admitting_professional_credential,admitting_diagnoses,presenting_issues)
VALUES ('a4000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001',
        now() - interval '2 days','a1000000-0000-0000-0000-000000000001','Dr. Prescriber','PMHNP',ARRAY['F25.0'],'Step-down from inpatient');

SELECT t_err('T2.3 admission needs a diagnosis or presenting issue',
  $q$INSERT INTO nova_admissions(tenant_id,patient_id,admitted_at,admitting_professional_name,admitting_professional_credential)
     VALUES ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000002',now(),'X','MD')$q$, 'check constraint');

-- T3 completeness on an empty chart ------------------------------------
SELECT t_ok('T3.1 empty chart reports missing Article 7 items',
  (SELECT count(*) FROM nova_chart_completeness('a4000000-0000-0000-0000-000000000001') WHERE status IN ('missing','overdue')) >= 6,
  (SELECT string_agg(requirement_code,', ') FROM nova_chart_completeness('a4000000-0000-0000-0000-000000000001') WHERE status IN ('missing','overdue')));

-- T4 note writing --------------------------------------------------------
SELECT t_err('T4.1 nobody can sign as someone else',
  $q$INSERT INTO nova_clinical_notes(tenant_id,patient_id,admission_id,note_type,service_date,narrative,authenticated_by)
     VALUES ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',
             'progress',current_date,'Resident attended morning group and engaged appropriately.','a1000000-0000-0000-0000-000000000001')$q$,
  'SIGNATURE_NOT_OWN');

SELECT t_as('a0000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000003'); -- BHT writes the note
INSERT INTO nova_clinical_notes(id,tenant_id,patient_id,admission_id,note_type,service_date,start_time,end_time,service_code,units,
  narrative,resident_response,ai_drafted,requires_cosign,author_credential)
VALUES ('a5000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001','skills_training',current_date,'09:00','10:00','H2017',4,
  'Provided independent living skills training on medication routine and meal planning.','Resident identified two steps independently.',
  true,true,'BHT');
SELECT t_err('T4.2 note narrative cannot be a stub',
  $q$INSERT INTO nova_clinical_notes(tenant_id,patient_id,admission_id,note_type,service_date,narrative)
     VALUES ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','progress',current_date,'ok')$q$,
  'check constraint');
WITH u AS (UPDATE nova_clinical_notes SET plan_next_steps='Continue daily practice.' WHERE id='a5000000-0000-0000-0000-000000000001' RETURNING 1)
SELECT t_ok('T4.3 unsigned note is editable', (SELECT count(*) FROM u) = 1);
SELECT t_ok('T4.4 author signs own note', nova_sign('nova_clinical_notes','a5000000-0000-0000-0000-000000000001') IS NOT NULL);
SELECT t_err('T4.5 signed note cannot be edited',
  $q$UPDATE nova_clinical_notes SET narrative='Changed after signing to something else entirely.' WHERE id='a5000000-0000-0000-0000-000000000001'$q$, 'CHART_LOCKED');
SELECT t_err('T4.6 signed note cannot be deleted',
  $q$DELETE FROM nova_clinical_notes WHERE id='a5000000-0000-0000-0000-000000000001'$q$, 'CHART_LOCKED');
SELECT t_err('T4.7 cannot sign twice',
  $q$SELECT nova_sign('nova_clinical_notes','a5000000-0000-0000-0000-000000000001')$q$, 'NOT_SIGNABLE');
SELECT t_err('T4.8 author cannot cosign own note',
  $q$UPDATE nova_clinical_notes SET cosigned_by='a1000000-0000-0000-0000-000000000003' WHERE id='a5000000-0000-0000-0000-000000000001'$q$, 'COSIGN_SELF');
INSERT INTO nova_chart_amendments(tenant_id,patient_id,target_table,target_id,amendment_type,reason,amended_content,authenticated_by)
VALUES ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001','nova_clinical_notes',
        'a5000000-0000-0000-0000-000000000001','addendum','Clarify duration','Session ran the full 60 minutes.','a1000000-0000-0000-0000-000000000003');
SELECT t_ok('T4.9 addendum recorded and signed on entry',
  (SELECT authenticated_at IS NOT NULL FROM nova_chart_amendments WHERE target_id='a5000000-0000-0000-0000-000000000001'));
SELECT t_as('a0000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000002'); -- RN cosigns
UPDATE nova_clinical_notes SET cosigned_by='a1000000-0000-0000-0000-000000000002' WHERE id='a5000000-0000-0000-0000-000000000001';
SELECT t_ok('T4.10 supervisor cosign recorded with server time',
  (SELECT cosigned_at IS NOT NULL FROM nova_clinical_notes WHERE id='a5000000-0000-0000-0000-000000000001'));
SELECT t_ok('T4.11 every change landed in the audit log',
  (SELECT count(*) >= 4 FROM nova_chart_audit WHERE row_id='a5000000-0000-0000-0000-000000000001'));

-- T5 orders --------------------------------------------------------------
INSERT INTO nova_clinical_orders(id,tenant_id,patient_id,admission_id,order_kind,order_text,order_source,ordered_at,
  issuing_practitioner_user_id,issuing_practitioner_name,issuing_practitioner_credential,received_by_name)
VALUES ('a6000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001','medication','Hydroxyzine 25 mg PO q6h PRN anxiety, max 4/day','telephone',now(),
  'a1000000-0000-0000-0000-000000000001','Dr. Prescriber','PMHNP','Nurse (A)');
SELECT t_err('T5.1 nurse cannot authenticate a practitioner''s telephone order',
  $q$SELECT nova_sign('nova_clinical_orders','a6000000-0000-0000-0000-000000000001')$q$, 'ORDER_AUTH');
SELECT t_err('T5.2 verbal/telephone order must name who received it',
  $q$INSERT INTO nova_clinical_orders(tenant_id,patient_id,admission_id,order_kind,order_text,order_source,ordered_at,issuing_practitioner_name,issuing_practitioner_credential)
     VALUES ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','lab','CBC','verbal',now(),'Dr','MD')$q$, 'check constraint');
SELECT t_as('a0000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000001');
SELECT t_ok('T5.3 issuing practitioner authenticates the order', nova_sign('nova_clinical_orders','a6000000-0000-0000-0000-000000000001') IS NOT NULL);

-- T6 MAR -----------------------------------------------------------------
SELECT t_as('a0000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000002');
INSERT INTO nova_medication_orders(id,tenant_id,patient_id,admission_id,clinical_order_id,medication_name,strength,dose,route,frequency,
  is_prn,prn_indication,prn_max_doses_per_day,is_psychotropic,start_date)
VALUES ('a7000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001','Hydroxyzine HCl','25 mg','25 mg','PO','q6h PRN',
  true,'anxiety',4,true,current_date);
SELECT t_err('T6.1 cannot give a dose from an unverified transcription',
  $q$INSERT INTO nova_medication_administrations(tenant_id,patient_id,admission_id,medication_order_id,administered_at,outcome,
       medication_name,strength,dose_given,route,pre_behavior_assessment,administered_by_name,professional_designation)
     VALUES ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',
       'a7000000-0000-0000-0000-000000000001',now(),'given','x','x','25 mg','PO','Pacing, tearful','Nurse (A)','RN')$q$,
  'MAR_UNVERIFIED_ORDER');
SELECT nova_sign('nova_medication_orders','a7000000-0000-0000-0000-000000000001');
SELECT t_err('T6.2 PRN psychotropic requires a behavior assessment before giving',
  $q$INSERT INTO nova_medication_administrations(tenant_id,patient_id,admission_id,medication_order_id,administered_at,outcome,
       medication_name,strength,dose_given,route,administered_by_name,professional_designation)
     VALUES ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',
       'a7000000-0000-0000-0000-000000000001',now(),'given','x','x','25 mg','PO','Nurse (A)','RN')$q$,
  'MAR_ASSESSMENT');
SELECT t_err('T6.3 a dose cannot be charted against the wrong resident',
  $q$INSERT INTO nova_medication_administrations(tenant_id,patient_id,admission_id,medication_order_id,administered_at,outcome,
       medication_name,strength,dose_given,route,pre_behavior_assessment,administered_by_name,professional_designation)
     VALUES ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-000000000001',
       'a7000000-0000-0000-0000-000000000001',now(),'given','x','x','25 mg','PO','Pacing','Nurse (A)','RN')$q$,
  'MAR_WRONG_RESIDENT');
INSERT INTO nova_medication_administrations(id,tenant_id,patient_id,admission_id,medication_order_id,administered_at,outcome,
  medication_name,strength,dose_given,route,pre_behavior_assessment,administered_by_name,professional_designation,authenticated_by)
VALUES ('a8000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001',now(),'given','typed wrong','typed wrong','25 mg','PO',
  'Pacing hallway, tearful, reports racing thoughts 7/10','Nurse (A)','RN','a1000000-0000-0000-0000-000000000002');
SELECT t_ok('T6.4 medication name/strength copied from the verified order, not the client',
  (SELECT medication_name = 'Hydroxyzine HCl' AND strength = '25 mg' FROM nova_medication_administrations WHERE id='a8000000-0000-0000-0000-000000000001'));
SELECT t_err('T6.5 signed administration cannot be changed',
  $q$UPDATE nova_medication_administrations SET dose_given='50 mg' WHERE id='a8000000-0000-0000-0000-000000000001'$q$, 'CHART_LOCKED');
UPDATE nova_medication_administrations SET effect_assessment='Calmer after 45 min, rated anxiety 3/10' WHERE id='a8000000-0000-0000-0000-000000000001';
SELECT t_ok('T6.6 PRN effect can be added once after signing, stamped with user and time',
  (SELECT effect_assessed_by = 'a1000000-0000-0000-0000-000000000002' AND effect_assessed_at IS NOT NULL
   FROM nova_medication_administrations WHERE id='a8000000-0000-0000-0000-000000000001'));
SELECT t_err('T6.7 PRN effect cannot be overwritten',
  $q$UPDATE nova_medication_administrations SET effect_assessment='rewritten' WHERE id='a8000000-0000-0000-0000-000000000001'$q$, 'CHART_LOCKED');
SELECT t_err('T6.8 refused dose needs a reason',
  $q$INSERT INTO nova_medication_administrations(tenant_id,patient_id,admission_id,medication_order_id,administered_at,outcome,
       medication_name,strength,dose_given,route,administered_by_name,professional_designation)
     VALUES ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',
       'a7000000-0000-0000-0000-000000000001',now(),'refused','x','x','0','PO','Nurse (A)','RN')$q$, 'check constraint');

-- T7 complete the rest of the chart, then completeness must be clean ----
INSERT INTO nova_consents(tenant_id,patient_id,admission_id,consent_type,description,signed_by_name,signer_relationship,signed_on,authenticated_by)
VALUES ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','general',
        'General consent to treatment','Jordan Rivera','resident',current_date,'a1000000-0000-0000-0000-000000000002'),
       ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','informed_psychotropic',
        'Hydroxyzine risks/benefits reviewed','Jordan Rivera','resident',current_date,'a1000000-0000-0000-0000-000000000002');
INSERT INTO nova_history_physicals(tenant_id,patient_id,admission_id,performed_on,practitioner_name,practitioner_credential,medical_history,exam_findings,authenticated_by)
VALUES ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',current_date-3,
        'Dr. Prescriber','PMHNP','No chronic medical conditions reported.','Vitals WNL; no acute findings.','a1000000-0000-0000-0000-000000000002');
INSERT INTO nova_tb_screenings(tenant_id,patient_id,admission_id,method,performed_on,result,authenticated_by)
VALUES ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','igra',current_date-1,'negative','a1000000-0000-0000-0000-000000000002');
INSERT INTO nova_bh_assessments(tenant_id,patient_id,admission_id,assessment_type,performed_on,performed_by_name,performed_by_credential,
  presenting_concerns,risk_assessment,diagnoses,recommendations,authenticated_by)
VALUES ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','initial',current_date-1,
  'Nurse (A)','RN','Transition from inpatient; anxiety, sleep disruption','Low risk to self/others; no elopement history',ARRAY['F25.0'],
  'BHRF level of care; skills training; medication monitoring','a1000000-0000-0000-0000-000000000002');
INSERT INTO nova_treatment_plans(id,tenant_id,patient_id,admission_id,effective_on,review_due_on,presenting_issues,resident_participated,
  developed_by_name,developed_by_credential,status)
VALUES ('a9000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',current_date,current_date+90,'Anxiety; independent living skills',true,'Nurse (A)','RN','active');
INSERT INTO nova_treatment_plan_goals(tenant_id,treatment_plan_id,goal_number,problem,goal,measurable_objective,interventions,frequency,responsible_role)
VALUES ('a0000000-0000-0000-0000-00000000000a','a9000000-0000-0000-0000-000000000001',1,'Difficulty managing medications',
  'Manage own medication routine','Takes meds with 1 or fewer prompts on 6 of 7 days','Daily skills coaching','Daily','BHT');
SELECT nova_sign('nova_treatment_plans','a9000000-0000-0000-0000-000000000001');
SELECT t_as('a0000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000001');
SELECT nova_sign('nova_admissions','a4000000-0000-0000-0000-000000000001');
SELECT nova_sign('nova_resident_profiles', (SELECT id FROM nova_resident_profiles WHERE patient_id='a2000000-0000-0000-0000-000000000001'));
SELECT t_ok('T7.1 fully documented chart has no missing/unsigned items',
  NOT EXISTS (SELECT 1 FROM nova_chart_completeness('a4000000-0000-0000-0000-000000000001') WHERE status NOT IN ('ok','not_applicable')),
  (SELECT string_agg(requirement_code||'='||status,', ') FROM nova_chart_completeness('a4000000-0000-0000-0000-000000000001') WHERE status NOT IN ('ok','not_applicable')));

-- T8 TB overdue detection ------------------------------------------------
INSERT INTO nova_admissions(id,tenant_id,patient_id,admitted_at,admitting_professional_name,admitting_professional_credential,presenting_issues)
VALUES ('a4000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000002',
        now() - interval '10 days','Dr. Prescriber','PMHNP','Step-down');
SELECT t_ok('T8.1 TB clearance flagged overdue after 7 days',
  (SELECT status = 'overdue' FROM nova_chart_completeness('a4000000-0000-0000-0000-000000000002') WHERE requirement_code='TB_CLEARANCE'));

-- T9 claims --------------------------------------------------------------
INSERT INTO nova_payer_plans(id,tenant_id,payer_name,clearinghouse,claim_format)
VALUES ('aa000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','Test Health Plan','Office Ally','837P');
INSERT INTO nova_claims(id,tenant_id,patient_id,admission_id,payer_plan_id,member_id,billing_provider_npi,diagnosis_codes,statement_from,statement_to)
VALUES ('ab000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','A00000000','1234567890',ARRAY['F25.0'],current_date-1,current_date);
INSERT INTO nova_claim_lines(tenant_id,claim_id,line_number,service_date,procedure_code,units,charge)
VALUES ('a0000000-0000-0000-0000-00000000000a','ab000000-0000-0000-0000-000000000001',1,current_date,'H2017',4,100);
SELECT t_ok('T9.1 claim line without signed documentation is blocked',
  EXISTS (SELECT 1 FROM nova_claim_validate('ab000000-0000-0000-0000-000000000001') WHERE issue LIKE 'No supporting clinical note%'));
UPDATE nova_claim_lines SET supporting_note_id='a5000000-0000-0000-0000-000000000001' WHERE claim_id='ab000000-0000-0000-0000-000000000001';
SELECT t_ok('T9.2 claim backed by a signed, cosigned note passes validation',
  NOT EXISTS (SELECT 1 FROM nova_claim_validate('ab000000-0000-0000-0000-000000000001') WHERE severity='error'),
  (SELECT string_agg(issue,'; ') FROM nova_claim_validate('ab000000-0000-0000-0000-000000000001')));
SELECT t_err('T9.3 NPI must be 10 digits',
  $q$UPDATE nova_claims SET billing_provider_npi='12345' WHERE id='ab000000-0000-0000-0000-000000000001'$q$, 'check constraint');

-- T10 the other tenant sees nothing of ACH's chart ----------------------
SELECT t_as('b0000000-0000-0000-0000-00000000000b','b1000000-0000-0000-0000-000000000001');
SELECT t_ok('T10.1 other tenant sees none of the clinical notes', (SELECT count(*) FROM nova_clinical_notes) = 0);
SELECT t_ok('T10.2 other tenant sees none of the MAR', (SELECT count(*) FROM nova_medication_administrations) = 0);
SELECT t_ok('T10.3 other tenant sees none of the audit trail', (SELECT count(*) FROM nova_chart_audit WHERE tenant_id='a0000000-0000-0000-0000-00000000000a') = 0);
SELECT t_ok('T10.4 dashboard view respects RLS', (SELECT count(*) FROM nova_chart_status) = 1);
SELECT t_err('T10.5 cannot run completeness on another tenant''s admission',
  $q$SELECT * FROM nova_chart_completeness('a4000000-0000-0000-0000-000000000001')$q$, 'NOT_VISIBLE');
SELECT t_err('T10.6 cannot sign another tenant''s record',
  $q$SELECT nova_sign('nova_clinical_orders','a6000000-0000-0000-0000-000000000001')$q$, 'NOT_SIGNABLE');
SELECT t_err('T10.7 cannot claim another tenant''s session by spoofing tenant_id on insert',
  $q$INSERT INTO nova_clinical_notes(tenant_id,patient_id,admission_id,note_type,service_date,narrative)
     VALUES ('a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',
             'progress',current_date,'Spoofed note written from the other agency.')$q$, 'row-level security');

RESET ROLE;

-- ---------------------------------------------------------------- report
SELECT result, test, COALESCE(left(detail,90),'') AS detail FROM nova_test_results ORDER BY n;
SELECT count(*) FILTER (WHERE result='PASS') AS passed, count(*) FILTER (WHERE result='FAIL') AS failed, count(*) AS total
FROM nova_test_results;
