# aphring

**Nigeria's community knowledge network.** People contribute history, politics, tradition and civic
knowledge as text, documents (PDF / DOCX / TXT) or oral recordings. Moderators verify it. Verified
knowledge is indexed into people, places, schools, organisations, events and topics, shown on a
personalised **Explore** page, and used as the only source for **Ask Aphring** answers.

See [`IMPROVEMENTS.md`](./IMPROVEMENTS.md) for what changed from the previous build and what is deferred.

## Roles

| Role | How you get it | What you can do |
|---|---|---|
| User | Register | Contribute, vote, save, share, download, report, propose corrections, ask |
| Moderator | An admin invites your username; you accept on **/me** | Everything in the **Workstation** except People and Ops |
| Admin | Your username is listed in `ADMIN_USERNAMES` | Everything, including inviting/revoking moderators, deleting entities, reindexing and the audit log |

There is **no default admin account or password**. Set `ADMIN_USERNAMES`, deploy, then immediately
register those usernames. Removing a username from the variable demotes that user on their next request.

## Run with Docker (Coolify or any host)

```bash
cp .env.example .env
# Edit .env and set at least JWT_SECRET (openssl rand -hex 32), ADMIN_USERNAMES and POSTGRES_PASSWORD.
docker compose up -d --build
docker compose run --rm backend npx tsx prisma/seed.ts   # optional: place catalogue (Abia LGAs/towns), no users
```

For Coolify, create a Docker Compose resource, set the variables below, and map a domain to the
**frontend** service only. The browser calls `/api/*` on the frontend, and Next.js proxies those calls to the backend.

The backend runs `prisma migrate deploy` on start.

### Fresh database required

Use a **new empty Postgres** (new Coolify project / new volume). This build ships **no** database wipe tool — migrations run on start against a clean DB. Do not point it at an old Aphring `db push` database.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `JWT_SECRET` | **yes** | ≥ 32 random characters. In production the backend refuses to start without a strong one. |
| `ADMIN_USERNAMES` | yes | Comma-separated admin usernames, case-insensitive. |
| `POSTGRES_PASSWORD` | yes (Docker) | Database password used by compose. |
| `DATABASE_URL` | local dev | Set automatically by compose. |
| `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID` | no | Chat model. Without them, Ask returns the matching verified excerpts with links and no model call. |
| `EMBEDDING_API_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL` | no | Semantic search. Records are embedded once, when verified. Without them, keyword search is used. |
| `OPENAI_API_KEY` | no | Whisper transcription for oral uploads. Without it, contributors paste a transcript. |
| `FRONTEND_URL` | no | CORS origin(s), only if browsers call the backend directly. |
| `STORAGE_PATH` | no | Upload directory (compose: `/app/uploads`, a named volume). |
| `ALLOW_FAKE_EMBEDDINGS` | dev only | Deterministic fake vectors for local testing; ignored in production. |
| `PRISMA_LOG_QUERIES` | no | `true` to log every SQL query. |
| `BACKEND_URL` | frontend build | Where Next.js proxies `/api`. **Read at build time** (compose passes `http://backend:4000`). |

## Local development

```bash
# Postgres 15+ with pgvector, then:
cd backend && cp .env.example .env    # set JWT_SECRET, ADMIN_USERNAMES
npm install && npx prisma migrate deploy && npx tsx prisma/seed.ts && npm run dev   # :4000
cd ../frontend && npm install && BACKEND_URL=http://localhost:4000 npm run dev      # :3000
```

## Stack

Next.js 15 · Express · Prisma (migrations) · PostgreSQL + pgvector · local file storage · Runpod Granite (optional)

## How AI cost is kept low

- **Explore, Feed, the leaderboard, badges and entity pages make no AI calls.** They are SQL over the verified index.
- Each record is embedded once, on verification. Re-embedding happens only if its text changes. No embeddings are generated for pending content.
- If no verified record matches a question, Ask replies "no verified information" without calling the model.
- Without a chat model configured, Ask quotes the verified excerpts directly.
- Chat is rate-limited to 60 messages per user per hour.
- Entity suggestions in the Workstation are rule-based (honorifics, "… School", "… Party", known catalogue names), not AI.
