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

-- Identity helpers nova_current_tenant()/nova_current_user() come from build_65 (signed context / JWT).

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

-- Identity, roster and rule tables: tenant-readable, never writable by app users (C4)
CREATE TABLE IF NOT EXISTS nova_rls_readonly_tables (table_name text PRIMARY KEY);
INSERT INTO nova_rls_readonly_tables(table_name) VALUES
 ('nova_users'),('nova_roles'),('nova_user_roles'),('nova_organization_users'),('nova_organization_roles'),
 ('nova_staff_credentials'),('nova_chart_rules'),('nova_tenant_policies'),('nova_agent_role_assignments')
ON CONFLICT DO NOTHING;

-- Builds a WITH CHECK clause: every single-column foreign key to a tenant-scoped
-- table must point at a row the caller can see (C9: no cross-tenant references,
-- no id-existence oracle).
CREATE OR REPLACE FUNCTION nova_rls_fk_check(p_table oid, p_scoped text[]) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE fk record; parts text[] := '{}'; tname text;
BEGIN
  SELECT relname INTO tname FROM pg_class WHERE oid = p_table;
  FOR fk IN
    SELECT a.attname AS col, rc.relname AS parent, ra.attname AS pcol
    FROM pg_constraint k
    JOIN pg_attribute a  ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
    JOIN pg_class rc     ON rc.oid = k.confrelid
    JOIN pg_attribute ra ON ra.attrelid = k.confrelid AND ra.attnum = k.confkey[1]
    WHERE k.conrelid = p_table AND k.contype = 'f' AND array_length(k.conkey,1) = 1
      AND rc.relname = ANY(p_scoped) AND k.confrelid <> p_table
  LOOP
    parts := parts || format('(%1$I.%2$I IS NULL OR EXISTS (SELECT 1 FROM %3$I p WHERE p.%4$I = %1$I.%2$I))', tname, fk.col, fk.parent, fk.pcol);
  END LOOP;
  RETURN CASE WHEN array_length(parts,1) IS NULL THEN 'true' ELSE array_to_string(parts, ' AND ') END;
END $$;

-- Report of what each table got (rebuilt every run)
CREATE TABLE IF NOT EXISTS nova_rls_coverage (
 table_name text PRIMARY KEY,
 tier text NOT NULL,
 policy_basis text,
 applied_at timestamptz NOT NULL DEFAULT now()
);

-- Reusable: later builds that add tables call SELECT nova_apply_rls(); at their end.
CREATE OR REPLACE FUNCTION nova_apply_rls() RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $rls$
DECLARE
  t record; pol record; tname text;
  app_roles text := 'nova_app';
  tenant_tables text[];
  scoped text[];        -- tables reachable to a tenant (A + T + B)
  changed boolean := true;
  chosen record;
BEGIN
  TRUNCATE nova_rls_coverage;
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
      EXECUTE format('CREATE POLICY nova_rls_tenant_read ON %I FOR SELECT TO %s USING (tenant_id = (SELECT nova_current_tenant()))', tname, app_roles);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I FROM %s', tname, app_roles);
      INSERT INTO nova_rls_coverage VALUES (tname, 'A', 'tenant_id, read-only (append-only audit)');
    ELSIF tname IN (SELECT table_name FROM nova_rls_readonly_tables) THEN
      EXECUTE format('CREATE POLICY nova_rls_tenant_read ON %I FOR SELECT TO %s USING (tenant_id = (SELECT nova_current_tenant()))', tname, app_roles);
      INSERT INTO nova_rls_coverage VALUES (tname, 'A', 'tenant_id, read-only (identity/roster/rules)');
    ELSE
      EXECUTE format('CREATE POLICY nova_rls_tenant ON %I FOR ALL TO %s USING (tenant_id = (SELECT nova_current_tenant())) WITH CHECK (tenant_id = (SELECT nova_current_tenant()) AND %s)',
        tname, app_roles, nova_rls_fk_check(tname::regclass::oid, tenant_tables || ARRAY['nova_tenants']));
      INSERT INTO nova_rls_coverage VALUES (tname, 'A', 'tenant_id + references must be visible');
    END IF;
  END LOOP;

  -- Tier T
  CREATE POLICY nova_rls_own_tenant ON nova_tenants FOR SELECT TO nova_app USING (id = (SELECT nova_current_tenant()));
  IF app_roles LIKE '%authenticated%' THEN
    CREATE POLICY nova_rls_own_tenant_auth ON nova_tenants FOR SELECT TO authenticated USING (id = (SELECT nova_current_tenant()));
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
               AND c.relname NOT IN ('nova_rls_reference_tables','nova_rls_coverage','nova_rls_readonly_tables','nova_context_secret') LOOP
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
          'CREATE POLICY nova_rls_parent ON %I FOR ALL TO %s USING (EXISTS (SELECT 1 FROM %I p WHERE p.%I = %I.%I)) WITH CHECK (EXISTS (SELECT 1 FROM %I p WHERE p.%I = %I.%I) AND %s)',
          t.relname, app_roles,
          chosen.parent, chosen.parent_col, t.relname, chosen.col,
          chosen.parent, chosen.parent_col, t.relname, chosen.col,
          nova_rls_fk_check(t.oid, scoped));
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

  -- sequences: only those owned by tables app users may insert into (no row-count leaks)
  FOR t IN SELECT seq.relname AS seqname, tbl.relname AS tblname
           FROM pg_class seq JOIN pg_namespace n ON n.oid = seq.relnamespace
           JOIN pg_depend d ON d.objid = seq.oid AND d.deptype IN ('a','i')
           JOIN pg_class tbl ON tbl.oid = d.refobjid
           WHERE n.nspname = 'public' AND seq.relkind = 'S' LOOP
    IF t.tblname IN (SELECT table_name FROM nova_rls_coverage WHERE tier IN ('A','B'))
       AND t.tblname NOT IN (SELECT table_name FROM nova_rls_readonly_tables) AND t.tblname <> 'nova_chart_audit' THEN
      EXECUTE format('GRANT USAGE ON SEQUENCE %I TO %s', t.seqname, app_roles);
    ELSE
      EXECUTE format('REVOKE ALL ON SEQUENCE %I FROM %s', t.seqname, app_roles);
    END IF;
  END LOOP;
  -- functions: nothing for PUBLIC; app roles get only what they need (C10)
  REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
  EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %s', app_roles);
  EXECUTE format('REVOKE EXECUTE ON FUNCTION nova_chart_attach(text, text[]), nova_set_context_secret(text), nova_rls_fk_check(oid, text[]) FROM %s', app_roles);
  EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA public TO %s', app_roles);
  -- re-apply revokes the blanket SELECT re-granted
  FOR t IN SELECT table_name AS relname FROM nova_rls_coverage WHERE tier = 'P' LOOP
    EXECUTE format('REVOKE ALL ON %I FROM %s', t.relname, app_roles);
  END LOOP;
  FOR t IN SELECT r.table_name AS relname FROM nova_rls_readonly_tables r JOIN nova_rls_coverage c ON c.table_name = r.table_name LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %I FROM %s', t.relname, app_roles);
  END LOOP;
  EXECUTE format('REVOKE ALL ON nova_context_secret FROM %s', app_roles);
  -- Supabase: anonymous callers get nothing
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
  END IF;
  -- no temp tables for anyone but the owner (C2: temp-table shadowing)
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM %s', current_database(), app_roles);
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  -- views run with the caller's rights so RLS applies through them
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'v' LOOP
    EXECUTE format('ALTER VIEW %I SET (security_invoker = true)', t.relname);
  END LOOP;
  EXECUTE format('REVOKE EXECUTE ON FUNCTION nova_apply_rls() FROM %s', app_roles);
END $rls$;
REVOKE ALL ON FUNCTION nova_apply_rls() FROM PUBLIC;
SELECT nova_apply_rls();

