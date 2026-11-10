-- =====================================================================
-- BUILD 66 — ROW-LEVEL SECURITY (tenant isolation for every table)
-- Run AFTER all other builds. Safe to re-run: it rebuilds its own
-- policies from the live catalog, so new tables are covered too.
--
-- Tier A  table has tenant_id          -> tenant_id = nova_current_tenant()
-- Tier T  nova_tenants                 -> id = nova_current_tenant()
-- Tier B  child table, no tenant_id    -> visible only if its parent row is
--         visible (EXISTS through a foreign key; parent's own RLS applies)
-- Tier R  shared reference catalogs    -> read-only to app users
-- Tier P  platform-operator tables     -> no app access (service role only)
--
-- App roles: nova_app (plain Postgres / server) and, on Supabase,
-- authenticated. The service role / table owner is not limited by RLS,
-- so server code must NOT connect as the owner for user requests.
-- =====================================================================
SET client_min_messages = warning;

-- Identity helpers (also defined in build_65; repeated so this build stands alone)
CREATE OR REPLACE FUNCTION nova_jwt_claim(p_key text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> p_key,
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> p_key)
$$;
CREATE OR REPLACE FUNCTION nova_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.tenant_id', true), ''), nova_jwt_claim('tenant_id'))::uuid
$$;
CREATE OR REPLACE FUNCTION nova_current_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.user_id', true), ''), nova_jwt_claim('nova_user_id'))::uuid
$$;

DO $roles$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nova_app') THEN
    CREATE ROLE nova_app NOLOGIN;
  END IF;
  -- let the migrating user switch into nova_app (needed on PG16 / Supabase for tests and the API)
  BEGIN EXECUTE 'GRANT nova_app TO ' || quote_ident(current_user); EXCEPTION WHEN OTHERS THEN NULL; END;
END $roles$;

-- Shared reference catalogs every tenant may read (but not change)
CREATE TABLE IF NOT EXISTS nova_rls_reference_tables (table_name text PRIMARY KEY);
INSERT INTO nova_rls_reference_tables(table_name) VALUES
 ('nova_product_plans'),('nova_plan_features'),('nova_plan_addons'),
 ('nova_billing_products'),('nova_billing_prices'),
 ('nova_connector_catalog'),('nova_connector_versions'),
 ('nova_academy_courses'),('nova_academy_modules'),('nova_academy_learning_paths'),
 ('nova_academy_path_courses'),('nova_academy_instructors'),('nova_academy_assessments'),
 ('nova_service_catalog'),('nova_support_knowledge_articles'),('nova_tools'),('nova_metric_definitions')
ON CONFLICT DO NOTHING;

-- Report of what each table got (rebuilt every run)
CREATE TABLE IF NOT EXISTS nova_rls_coverage (
 table_name text PRIMARY KEY,
 tier text NOT NULL,
 policy_basis text,
 applied_at timestamptz NOT NULL DEFAULT now()
);
TRUNCATE nova_rls_coverage;

DO $rls$
DECLARE
  t record; pol record; tname text;
  app_roles text := 'nova_app';
  tenant_tables text[];
  scoped text[];        -- tables reachable to a tenant (A + T + B)
  changed boolean := true;
  chosen record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    app_roles := app_roles || ', authenticated';
  END IF;

  SELECT array_agg(c.relname) INTO tenant_tables
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped);
  scoped := tenant_tables || ARRAY['nova_tenants'];

  -- Clear our previous policies and turn RLS on everywhere
  FOR t IN SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r' LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t.relname AND policyname LIKE 'nova_rls_%' LOOP
      EXECUTE format('DROP POLICY %I ON %I', pol.policyname, t.relname);
    END LOOP;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO %s', t.relname, app_roles);
  END LOOP;

  -- Tier A
  FOREACH tname IN ARRAY tenant_tables LOOP
    IF tname = 'nova_chart_audit' THEN
      -- append-only: readable by tenant, written only by the audit trigger
      EXECUTE format('CREATE POLICY nova_rls_tenant_read ON %I FOR SELECT TO %s USING (tenant_id = nova_current_tenant())', tname, app_roles);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I FROM %s', tname, app_roles);
      INSERT INTO nova_rls_coverage VALUES (tname, 'A', 'tenant_id, read-only (append-only audit)');
    ELSE
      EXECUTE format('CREATE POLICY nova_rls_tenant ON %I FOR ALL TO %s USING (tenant_id = nova_current_tenant()) WITH CHECK (tenant_id = nova_current_tenant())', tname, app_roles);
      INSERT INTO nova_rls_coverage VALUES (tname, 'A', 'tenant_id');
    END IF;
  END LOOP;

  -- Tier T
  CREATE POLICY nova_rls_own_tenant ON nova_tenants FOR SELECT TO nova_app USING (id = nova_current_tenant());
  IF app_roles LIKE '%authenticated%' THEN
    CREATE POLICY nova_rls_own_tenant_auth ON nova_tenants FOR SELECT TO authenticated USING (id = nova_current_tenant());
  END IF;
  EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON nova_tenants FROM %s', app_roles);
  INSERT INTO nova_rls_coverage VALUES ('nova_tenants', 'T', 'id = current tenant, read-only');

  -- Tier B: repeatedly attach children whose FK parent is already scoped
  WHILE changed LOOP
    changed := false;
    FOR t IN SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'r'
               AND c.relname <> ALL(scoped)
               AND c.relname NOT IN (SELECT table_name FROM nova_rls_reference_tables)
               AND c.relname NOT IN ('nova_rls_reference_tables','nova_rls_coverage') LOOP
      SELECT a.attname AS col, rc.relname AS parent, ra.attname AS parent_col, a.attnotnull AS notnull
        INTO chosen
      FROM pg_constraint k
      JOIN pg_attribute a  ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
      JOIN pg_class rc     ON rc.oid = k.confrelid
      JOIN pg_attribute ra ON ra.attrelid = k.confrelid AND ra.attnum = k.confkey[1]
      WHERE k.conrelid = t.oid AND k.contype = 'f' AND array_length(k.conkey,1) = 1
        AND rc.relname = ANY(scoped) AND rc.relname <> t.relname
      ORDER BY a.attnotnull DESC, (a.attname LIKE '%user%') ASC, a.attnum
      LIMIT 1;
      IF chosen.col IS NOT NULL AND chosen.parent IS NOT NULL THEN
        EXECUTE format(
          'CREATE POLICY nova_rls_parent ON %I FOR ALL TO %s USING (EXISTS (SELECT 1 FROM %I p WHERE p.%I = %I.%I)) WITH CHECK (EXISTS (SELECT 1 FROM %I p WHERE p.%I = %I.%I))',
          t.relname, app_roles,
          chosen.parent, chosen.parent_col, t.relname, chosen.col,
          chosen.parent, chosen.parent_col, t.relname, chosen.col);
        INSERT INTO nova_rls_coverage VALUES (t.relname, 'B', chosen.col || ' -> ' || chosen.parent
          || CASE WHEN chosen.notnull THEN '' ELSE ' (nullable link: unlinked rows hidden)' END);
        scoped := scoped || t.relname;
        changed := true;
      END IF;
      chosen := NULL;
    END LOOP;
  END LOOP;

  -- Tier R
  FOR t IN SELECT r.table_name AS relname FROM nova_rls_reference_tables r
           WHERE EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'public' AND c.relname = r.table_name AND c.relkind = 'r')
             AND r.table_name <> ALL(scoped) LOOP
    EXECUTE format('CREATE POLICY nova_rls_reference_read ON %I FOR SELECT TO %s USING (true)', t.relname, app_roles);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I FROM %s', t.relname, app_roles);
    INSERT INTO nova_rls_coverage VALUES (t.relname, 'R', 'shared catalog, read-only');
  END LOOP;

  -- Tier P: everything left gets no policy => denied to app roles
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r'
             AND c.relname NOT IN (SELECT table_name FROM nova_rls_coverage) LOOP
    EXECUTE format('REVOKE ALL ON %I FROM %s', t.relname, app_roles);
    INSERT INTO nova_rls_coverage VALUES (t.relname, 'P', 'platform/operator only (service role)');
  END LOOP;

  EXECUTE format('GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO %s', app_roles);
  EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %s', app_roles);
  EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA public TO %s', app_roles) ;
  -- re-apply revokes for read-only/no-access tiers (the blanket SELECT above re-granted them)
  FOR t IN SELECT table_name AS relname FROM nova_rls_coverage WHERE tier = 'P' LOOP
    EXECUTE format('REVOKE ALL ON %I FROM %s', t.relname, app_roles);
  END LOOP;
END $rls$;

-- Views must run with the caller's rights so RLS applies through them
DO $views$
DECLARE v record;
BEGIN
  FOR v IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'v' LOOP
    EXECUTE format('ALTER VIEW %I SET (security_invoker = true)', v.relname);
  END LOOP;
END $views$;
