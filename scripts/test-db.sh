#!/usr/bin/env bash
# Applies new migrations to a throwaway Postgres database that mimics the live project, then runs the SQL tests.
# Needs a local Postgres; set PGHOST/PGUSER etc. as usual. DB name: spmflow_test (dropped and recreated).
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${TEST_DB:-spmflow_test}
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
run(){ psql -v ON_ERROR_STOP=1 -q -X -d "$DB" "$@"; }
run -f supabase/tests/baseline.sql
# Migrations added after the live baseline (2026-10-28), in order.
for m in supabase/migrations/2026102812*.sql supabase/migrations/20261029*.sql; do echo "migration: $m"; run -f "$m"; done
node scripts/question-seed-sql.mjs | run
run -c "select pg_temp_check from (select count(*) = 2560 as pg_temp_check from public.questions) x" | grep -q t || { echo 'seed failed'; exit 1; }
echo 'seeded 2560 questions'
# Tests use their own fixtures: clear the seeded bank first.
run -c "truncate public.questions, public.question_sets cascade"
for t in supabase/tests/*.test.sql; do echo "test: $t"; run -o /dev/null -f "$t" 2>&1 | sed -n "s/.*NOTICE:  //p; /ERROR/p"; done
