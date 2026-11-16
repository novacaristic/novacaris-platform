-- Supabase-path check: the same RLS must hold when identity comes from the JWT
-- (PostgREST sets request.jwt.claims and switches to the "authenticated" role).
-- Run after tests/acceptance_tests.sql (uses its seeded test tenants).
\set ON_ERROR_STOP 1
DO $chk$
DECLARE a int; b int; n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE NOTICE 'SKIP: no "authenticated" role (not a Supabase database)'; RETURN;
  END IF;
  PERFORM set_config('app.tenant_id', '', true);
  PERFORM set_config('app.user_id', '', true);
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","app_metadata":{"tenant_id":"a0000000-0000-0000-0000-00000000000a","nova_user_id":"a1000000-0000-0000-0000-000000000002"}}', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO a FROM nova_patients;
  SELECT count(*) INTO b FROM nova_patients WHERE tenant_id = 'b0000000-0000-0000-0000-00000000000b';
  SELECT count(*) INTO n FROM nova_clinical_notes;
  RESET ROLE;
  IF b <> 0 THEN RAISE EXCEPTION 'FAIL: JWT user from tenant A can see % tenant B patient(s)', b; END IF;
  IF a < 1 OR n < 1 THEN RAISE EXCEPTION 'FAIL: JWT user from tenant A cannot see own data (patients=%, notes=%)', a, n; END IF;
  RAISE NOTICE 'PASS: JWT path isolates tenants (own patients=%, own notes=%, other tenant=0)', a, n;
END $chk$;
