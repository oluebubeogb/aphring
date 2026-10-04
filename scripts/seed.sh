#!/bin/sh
# Run inside backend container: sh scripts/seed.sh
# Or: npx tsx prisma/seed.ts
cd "$(dirname "$0")/../backend" 2>/dev/null || cd /app
npx tsx prisma/seed.ts
