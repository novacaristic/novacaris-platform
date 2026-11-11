#!/usr/bin/env bash
# NovaCarïs — live Supabase STAGING run (test project, synthetic data only).
#
#   export SUPABASE_DB_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres'
#   export I_CONFIRM_THIS_IS_A_TEST_PROJECT=yes
#   ./scripts/staging/run-supabase-staging.sh
#
# Use a NEW, EMPTY Supabase project created only for this test (no real residents).
# Run it once per fresh project. Output: staging-report-<timestamp>.txt
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the TEST project direct connection string}"
if [ "${I_CONFIRM_THIS_IS_A_TEST_PROJECT:-}" != "yes" ]; then
  echo "Refusing to run: set I_CONFIRM_THIS_IS_A_TEST_PROJECT=yes (never point this at a project with real data)."; exit 2
fi
command -v psql >/dev/null || { echo "psql is required (brew install libpq / apt install postgresql-client)"; exit 2; }
REPORT="staging-report-$(date +%Y%m%d-%H%M%S).txt"
log(){ echo "$*" | tee -a "$REPORT"; }

log "NovaCarïs Supabase staging run — $(date -u +%FT%TZ)"
log "Commit: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
log "Server: $(psql "$SUPABASE_DB_URL" -Atc 'select version()')"
EXISTING=$(psql "$SUPABASE_DB_URL" -Atc "select count(*) from pg_tables where schemaname='public' and tablename like 'nova_%'")
if [ "$EXISTING" != "0" ]; then log "ABORT: public schema already has $EXISTING nova_ tables. Use a fresh test project."; exit 3; fi

log ""; log "== 1. Apply every build in order (ON_ERROR_STOP)"
n=0
for f in $(ls builds/*/sql/build_*.sql | sort -V); do
  if psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>>"$REPORT"; then n=$((n+1)); else log "FAIL applying $f"; exit 1; fi
done
log "PASS: $n build files applied"

log ""; log "== 2. Row-level security coverage"
psql "$SUPABASE_DB_URL" -Atc "select tier||': '||count(*) from nova_rls_coverage group by tier order by tier" | tee -a "$REPORT"
psql "$SUPABASE_DB_URL" -Atc "select 'tables without RLS: '||count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity" | tee -a "$REPORT"

log ""; log "== 3. Acceptance tests (as restricted role)"
psql "$SUPABASE_DB_URL" -q -f builds/65-clinical-chart-article7/tests/acceptance_tests.sql >/dev/null 2>>"$REPORT" || true
psql "$SUPABASE_DB_URL" -Atc "select result||'  '||test from nova_test_results order by n" | tee -a "$REPORT"
SUMMARY=$(psql "$SUPABASE_DB_URL" -Atc "select count(*) filter (where result='PASS')||' passed, '||count(*) filter (where result='FAIL')||' failed of '||count(*) from nova_test_results")
log "RESULT: $SUMMARY"

log ""; log "== 4. Supabase JWT path"
psql "$SUPABASE_DB_URL" -q -f scripts/staging/supabase_jwt_check.sql 2>&1 | grep -E "PASS|FAIL|SKIP" | tee -a "$REPORT" || true

log ""; log "== 5. Rotate the context secret (the test run used a known test value)"
psql "$SUPABASE_DB_URL" -q -c "select nova_set_context_secret(encode(gen_random_bytes(32),'hex'))" >/dev/null && log "PASS: test secret replaced with a random one (set your API's NOVA_CONTEXT_SECRET with nova_set_context_secret before connecting it)"

log ""; log "Report saved to $REPORT — send this file back for review."
