#!/bin/sh
# Seeds the internal place catalog only (no users). Safe to re-run.
# Inside the backend container: sh scripts/seed.sh   or   npx tsx prisma/seed.ts
cd "$(dirname "$0")/../backend" 2>/dev/null || cd /app
npx tsx prisma/seed.ts
