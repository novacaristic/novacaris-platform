-- NovaCarïs PostgreSQL RLS integration test.
-- Run after migrations 001 and 002 as the database administrator.
-- The test role must not own the tables; table owners bypass RLS.

CREATE ROLE novacaris_test NOLOGIN;
GRANT USAGE ON SCHEMA public TO novacaris_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO novacaris_test;

INSERT INTO organizations (id, name) VALUES
  ('org-a', 'NovaCaris Test Organization A'),
  ('org-b', 'NovaCaris Test Organization B');

INSERT INTO organization_members (organization_id, user_id, role) VALUES
  ('org-a', 'user-a', 'OWNER'),
  ('org-b', 'user-b', 'OWNER');

INSERT INTO workspaces (organization_id) VALUES ('org-a'), ('org-b');

INSERT INTO provider_intakes (organization_id, payload, submitted_at) VALUES
  ('org-a', '{"name":"A"}', NOW()),
  ('org-b', '{"name":"B"}', NOW());

INSERT INTO assessments (id, organization_id, score, status, rule_version, payload, created_at) VALUES
  ('assessment-a', 'org-a', 80, 'GREEN', 'TEST-1', '{}', NOW()),
  ('assessment-b', 'org-b', 70, 'AMBER', 'TEST-1', '{}', NOW());

INSERT INTO assessment_findings (id, assessment_id, organization_id, domain, priority, status, payload) VALUES
  ('finding-a', 'assessment-a', 'org-a', 'EVIDENCE', 'HIGH', 'OPEN', '{}'),
  ('finding-b', 'assessment-b', 'org-b', 'EVIDENCE', 'HIGH', 'OPEN', '{}');

INSERT INTO evidence_records (id, organization_id, kind, payload, created_at) VALUES
  ('evidence-a', 'org-a', 'DOCUMENT', '{}', NOW()),
  ('evidence-b', 'org-b', 'DOCUMENT', '{}', NOW());

INSERT INTO actions (id, organization_id, source_finding_id, title, status) VALUES
  ('action-a', 'org-a', 'finding-a', 'Action A', 'OPEN'),
  ('action-b', 'org-b', 'finding-b', 'Action B', 'OPEN');

INSERT INTO authorization_requests
  (id, organization_id, agent_id, action, subject_id, requested_at, status)
VALUES
  ('auth-a', 'org-a', 'mr-nova', 'PREPARE', 'action-a', NOW(), 'PENDING'),
  ('auth-b', 'org-b', 'mr-nova', 'PREPARE', 'action-b', NOW(), 'PENDING');

INSERT INTO evidence_ledger_entries
  (id, organization_id, event_type, actor_id, timestamp, subject_id)
VALUES
  ('ledger-a', 'org-a', 'AUTHORIZATION_REQUESTED', 'mr-nova', NOW(), 'action-a'),
  ('ledger-b', 'org-b', 'AUTHORIZATION_REQUESTED', 'mr-nova', NOW(), 'action-b');

SET ROLE novacaris_test;
SELECT set_config('app.organization_id', 'org-a', false);

DO $$
DECLARE c INTEGER;
BEGIN
  SELECT COUNT(*) INTO c FROM organizations; IF c <> 1 THEN RAISE EXCEPTION 'organizations isolation failed'; END IF;
  SELECT COUNT(*) INTO c FROM organization_members; IF c <> 1 THEN RAISE EXCEPTION 'members isolation failed'; END IF;
  SELECT COUNT(*) INTO c FROM workspaces; IF c <> 1 THEN RAISE EXCEPTION 'workspaces isolation failed'; END IF;
  SELECT COUNT(*) INTO c FROM provider_intakes; IF c <> 1 THEN RAISE EXCEPTION 'intake isolation failed'; END IF;
  SELECT COUNT(*) INTO c FROM assessments; IF c <> 1 THEN RAISE EXCEPTION 'assessment isolation failed'; END IF;
  SELECT COUNT(*) INTO c FROM assessment_findings; IF c <> 1 THEN RAISE EXCEPTION 'finding isolation failed'; END IF;
  SELECT COUNT(*) INTO c FROM evidence_records; IF c <> 1 THEN RAISE EXCEPTION 'evidence isolation failed'; END IF;
  SELECT COUNT(*) INTO c FROM actions; IF c <> 1 THEN RAISE EXCEPTION 'action isolation failed'; END IF;
  SELECT COUNT(*) INTO c FROM authorization_requests; IF c <> 1 THEN RAISE EXCEPTION 'authorization isolation failed'; END IF;
  SELECT COUNT(*) INTO c FROM evidence_ledger_entries; IF c <> 1 THEN RAISE EXCEPTION 'ledger isolation failed'; END IF;
  SELECT COUNT(*) INTO c FROM authorization_requests; IF c <> 1 THEN RAISE EXCEPTION 'authorization isolation failed'; END IF;
END $$;

UPDATE authorization_requests
SET rationale = 'cross-org-update'
WHERE id = 'auth-b';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM authorization_requests WHERE id = 'auth-b') THEN
    RAISE EXCEPTION 'cross-organization authorization UPDATE bypassed RLS';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO evidence_records (id, organization_id, kind, payload, created_at)
    VALUES ('evidence-cross-org', 'org-b', 'DOCUMENT', '{}', NOW());
    RAISE EXCEPTION 'cross-organization INSERT bypassed RLS';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;
DROP ROLE novacaris_test;

SELECT 'POSTGRES_RLS_TEST_PASS' AS result;
