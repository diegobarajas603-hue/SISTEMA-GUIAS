#!/usr/bin/env bash
# Prueba la migración y las reglas de privacidad contra un Postgres local.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"
DB=orbita_test
psql -q -c "drop database if exists $DB" -c "create database $DB"
psql -q -d $DB -c "do \$\$ begin create role anon nologin; exception when duplicate_object then null; end \$\$" \
             -c "do \$\$ begin create role authenticated nologin; exception when duplicate_object then null; end \$\$"
grep -v "^create role" auth_stub.sql | psql -q -v ON_ERROR_STOP=1 -d $DB
psql -q -v ON_ERROR_STOP=1 -d $DB -f ../migrations/20260929000000_init.sql
psql -q -At -d $DB -f privacy_test.sql
