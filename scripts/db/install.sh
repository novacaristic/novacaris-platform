#!/usr/bin/env bash
# NovaCarïs — the one database install / upgrade sequence.
#
#   DATABASE_URL='postgresql://user:pass@host:5432/db' ./scripts/db/install.sh
#   ./scripts/db/install.sh --list      # show the order, apply nothing
#
# Applies every builds/*/sql/build_*.sql in numeric build order, each file in its
# own transaction, and records it in nova_schema_install_log with a SHA-256 of the
# file. Every build file is written to be re-runnable, so running this again on an
# installed database upgrades it in place. A file whose contents changed since it
# was last applied is re-applied and logged as a new row, so the log shows exactly
# what ran, when, and in what version.
#
# Seed/demo files and ad-hoc scripts (anything not named build_*.sql) are never run.
set -euo pipefail
cd "$(dirname "$0")/../.."

FILES=$(ls builds/*/sql/build_*.sql | sort -V)
if [ "${1:-}" = "--list" ]; then echo "$FILES"; exit 0; fi
: "${DATABASE_URL:?Set DATABASE_URL to the target database}"
command -v psql >/dev/null || { echo "psql is required"; exit 2; }
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

./scripts/db/check-schema-drift.sh

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE TABLE IF NOT EXISTS nova_schema_install_log (
  build_file text NOT NULL,
  sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL DEFAULT session_user,
  PRIMARY KEY (build_file, sha256)
);
SQL

n=0; changed=0
for f in $FILES; do
  sum=$(sha256sum "$f" | cut -d' ' -f1)
  prev=$(psql "$DATABASE_URL" -Atc "SELECT sha256 FROM nova_schema_install_log WHERE build_file = '$f' ORDER BY applied_at DESC LIMIT 1")
  if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -1 -f "$f" >/dev/null; then
    echo "FAIL applying $f (that file was rolled back; earlier files stay applied)"; exit 1
  fi
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "INSERT INTO nova_schema_install_log(build_file, sha256) VALUES ('$f', '$sum') ON CONFLICT DO NOTHING"
  [ -n "$prev" ] && [ "$prev" != "$sum" ] && { echo "updated: $f"; changed=$((changed+1)); }
  n=$((n+1))
done
# nova_schema_install_log is created after build 66 last ran in an earlier install; lock it down now
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "SELECT nova_apply_rls()" >/dev/null
echo "OK: $n build files applied ($changed changed since the last install)"
psql "$DATABASE_URL" -Atc "SELECT 'tables without row-level security: ' || count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity"
