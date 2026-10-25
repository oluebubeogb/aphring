#!/bin/sh
set -e
if ! npx prisma migrate deploy; then
  echo ""
  echo "✖ prisma migrate deploy failed."
  echo "  Use a fresh empty Postgres database (new Coolify resource / new volume)."
  echo "  This build does not ship a database wipe tool."
  exit 1
fi
exec node dist/index.js
