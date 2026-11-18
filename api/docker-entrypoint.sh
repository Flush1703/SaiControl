#!/bin/sh
set -eu

# Render espone PostgreSQL come postgresql://; JDBC richiede jdbc:postgresql://.
if [ -n "${DATABASE_URL:-}" ] && [ -z "${JDBC_DATABASE_URL:-}" ]; then
  export JDBC_DATABASE_URL="jdbc:${DATABASE_URL}"
fi

exec java -Dserver.port="${PORT:-8080}" -jar /app/app.jar

