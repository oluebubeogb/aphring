# aphring

**Nigeria's Community Knowledge Network** — Phase 1 + Phase 2

---

## Phase 2 features

- Community voting (upvote / downvote) + source ranking
- User reputation
- Report system for moderators
- Oral history: audio upload → STT (Whisper) → fact extraction
- Expanded Abia communities seed (LGAs / wards)
- Enhanced admin: pending queue, uploaded files list, stats
- Same-origin `/api` proxy (no localhost in browser)

## Admin

```
email: admin@aphring.com
password: admin123456
```

Seed (backend container):
```bash
npx tsx prisma/seed.ts
```

## Coolify

1. Push repo → Docker Compose resource  
2. Env: `JWT_SECRET`, `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID=granite-4-0-h-small`, optional `OPENAI_API_KEY` / `EMBEDDING_API_KEY`  
3. Map **frontend** domain only (API is proxied)  
4. Redeploy  

## Stack

Next.js 15 · Express · Prisma · PostgreSQL + pgvector · local file storage · Runpod Granite

## Design

Minimal colors, whitespace, knowledge-first. AI answers only from verified Aphring context.
