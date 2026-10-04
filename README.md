# aphring

**Nigeria's Community Knowledge Network**

Phase 1 — Core Platform

---

## Stack

| Layer        | Tech                          |
|--------------|-------------------------------|
| Frontend     | Next.js 15 (App Router)       |
| Backend      | Node.js + Express + Prisma    |
| Database     | PostgreSQL 17 + pgvector      |
| Object Store | MinIO                         |
| AI           | Runpod Granite + embeddings   |
| Deploy       | Coolify + Docker Compose      |

---

## Quick Start (Local)

```bash
# 1. Clone
git clone https://github.com/YOUR_USER/aphring.git
cd aphring

# 2. Env
cp .env.example .env
# Edit .env with your secrets

# 3. Run everything
docker compose up --build
```

- Frontend → http://localhost:3000  
- Backend  → http://localhost:4000  
- MinIO    → http://localhost:9001 (aphring / aphring_minio_secret)

Default admin (after seed):
```
email: admin@aphring.com
password: admin123456
```

To seed:
```bash
docker compose exec backend npx tsx prisma/seed.ts
```

---

## Coolify Deploy (GitHub push)

1. Push this repo to GitHub.
2. In Coolify → **New Resource** → **Docker Compose**.
3. Connect the GitHub repo.
4. Set the following **Environment Variables** in Coolify:

| Variable              | Example / Notes                                      |
|-----------------------|------------------------------------------------------|
| `JWT_SECRET`          | long random string                                   |
| `NEXTAUTH_SECRET`     | long random string                                   |
| `NEXTAUTH_URL`        | https://aphring.yourdomain.com                       |
| `FRONTEND_URL`        | https://aphring.yourdomain.com                       |
| `NEXT_PUBLIC_API_URL` | https://api.aphring.yourdomain.com                   |
| `RUNPOD_API_KEY`      | your Runpod key                                      |
| `RUNPOD_ENDPOINT_ID`  | your Granite endpoint ID                             |
| `EMBEDDING_API_KEY`   | OpenAI (or compatible) key for embeddings            |
| `EMBEDDING_API_URL`   | https://api.openai.com/v1 (default)                  |
| `EMBEDDING_MODEL`     | text-embedding-3-small                               |

5. Map domains:
   - Frontend service → `aphring.yourdomain.com`
   - Backend service  → `api.aphring.yourdomain.com`

6. Deploy. Coolify will build both Dockerfiles and start Postgres + MinIO + backend + frontend.

7. After first deploy, seed the database:
```bash
# Inside Coolify terminal for the backend container
npx tsx prisma/seed.ts
```

---

## Phase 1 Features

- [x] Auth (register / login / JWT)
- [x] GPT-style Chat with sidebar history
- [x] Document upload (PDF / TXT / DOC / DOCX) → MinIO
- [x] Text extraction + draft Knowledge Records
- [x] pgvector semantic search
- [x] AI answers **only** from verified Aphring knowledge + citations
- [x] Communities (Abia LGAs pre-seeded)
- [x] Knowledge Explorer (`/community/[slug]`)
- [x] Submission Center (drag-and-drop)
- [x] Moderator Verification Dashboard (`/admin`)
- [x] Light / Dark theme (minimal colors, whitespace)

---

## Project Structure

```
aphring/
├── frontend/          # Next.js 15
├── backend/           # Express + Prisma
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## API Overview

| Method | Path                        | Auth     | Description                |
|--------|-----------------------------|----------|----------------------------|
| POST   | /api/auth/register          | —        | Create account             |
| POST   | /api/auth/login             | —        | Login → JWT                |
| GET    | /api/auth/me                | Bearer   | Current user               |
| GET    | /api/chats                  | Bearer   | List chats                 |
| POST   | /api/chats                  | Bearer   | New chat                   |
| POST   | /api/chats/:id/messages     | Bearer   | Send message → AI answer   |
| POST   | /api/documents              | Bearer   | Upload + extract facts     |
| GET    | /api/knowledge              | —        | List verified records      |
| PATCH  | /api/knowledge/:id/status   | Mod/Admin| Verify / Reject            |
| GET    | /api/communities            | —        | List communities           |
| GET    | /api/communities/:slug      | —        | Community + records        |
| GET    | /api/admin/stats            | Mod/Admin| Dashboard stats            |
| GET    | /api/admin/pending          | Mod/Admin| Pending verification queue |

---

## Design

- Colors: pure white / near-black surfaces, no bright blues, no gradients
- Typography: system font stack, generous whitespace
- AI never answers outside the Aphring knowledge base

---

Built for Coolify. Push to GitHub → Deploy.
