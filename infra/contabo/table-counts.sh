#!/usr/bin/env bash
# Print "schema.table<TAB>row count" for every table of the EduIgnite database, sorted, plus media file/byte totals.
# Run on a server that has the stack; used to prove the new server holds exactly the same data as the old one.
# Exact counts (not estimates). Read-only.
set -euo pipefail
cd /opt/eduignite/backend
cd_docker() { docker compose -f docker-compose.prod.yml "$@"; }
# One query: exact count(*) of every table, using query_to_xml so no per-table shell loop (or quoting) is needed.
cd_docker exec -T db sh -c 'psql -U "$DB_USER" -d "$DB_NAME" -At -F "	"' <<'SQL'
select table_schema || '.' || table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
from information_schema.tables
where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')
order by 1;
SQL
printf 'MEDIA_FILES\t%s\n' "$(find /opt/eduignite/media -type f 2>/dev/null | wc -l)"
printf 'MEDIA_BYTES\t%s\n' "$(find /opt/eduignite/media -type f -printf '%s\n' 2>/dev/null | awk '{s+=$1} END {print s+0}')"
