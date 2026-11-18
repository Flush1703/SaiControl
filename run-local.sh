#!/bin/sh
set -eu

cd "$(dirname "$0")"
if [ ! -f .env.local ]; then
  echo 'Crea .env.local e configura le credenziali del database.' >&2
  exit 1
fi

set -a
. ./.env.local
set +a
: "${JDBC_DATABASE_PASSWORD:?Inserisci la password PostgreSQL in .env.local}"
: "${APP_LOGIN_PASSWORD:?Scegli una password di accesso e inseriscila in .env.local}"
exec ./mvnw -f api/pom.xml spring-boot:run
