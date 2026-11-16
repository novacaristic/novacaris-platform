# Database install

`./scripts/db/install.sh` is the one way to install or upgrade the NovaCarïs database. It:

- runs every `builds/*/sql/build_*.sql` in build order, each file in its own transaction
- logs each file and its SHA-256 in `nova_schema_install_log` (re-running upgrades in place; changed files are reported)
- runs `check-schema-drift.sh` first, which refuses a table defined in more than one build
- re-applies row-level security at the end and reports any table without it (should be 0)

```
DATABASE_URL='postgresql://…' ./scripts/db/install.sh
./scripts/db/install.sh --list   # show the order only
```

CI installs everything twice on a fresh database and runs the SQL acceptance tests on it.
Seed and demo files (anything not named `build_*.sql`) are never run by the installer.
