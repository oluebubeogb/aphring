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
| `RUNPOD_API_KEY`, `RUNPOD_BASE_URL`, `RUNPOD_MODEL` | no | Chat via OpenAI-compatible API (RunPod). Without them, Ask returns verified excerpts with no model call. Optional legacy: `RUNPOD_ENDPOINT_ID` for serverless `/runsync`. |
| `EMBEDDING_API_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL` | no | Semantic search. Records are embedded once, when verified. Without them, keyword search is used. |
| `MAIL_PROVIDER` | no | Default **`smtp`**. Also `resend` or `console`. Empty = auto (`SMTP_HOST` → smtp, Resend key → resend, else console). Console prints the word in the backend log and sends nothing. |
| `MAIL_FROM` | with mail | Sender, e.g. `Aphring <no-reply@aphring.ng>`. |
| `APP_URL` | with mail | Public site URL used in email links (falls back to `FRONTEND_URL`). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | smtp (default) | Any SMTP server. Port `587` by default; `SMTP_SECURE=true` for port 465. |
| `RESEND_API_KEY` | resend | Optional. Set `MAIL_PROVIDER=resend` to use Resend instead of SMTP. |
| `OPENAI_API_KEY` | no | Whisper transcription for oral uploads. Without it, contributors paste a transcript. |
| `FRONTEND_URL` | no | CORS origin(s), only if browsers call the backend directly. |
| `STORAGE_PATH` | no | Upload directory (compose: `/app/uploads`, a named volume). |
| `ALLOW_FAKE_EMBEDDINGS` | dev only | Deterministic fake vectors for local testing; ignored in production. |
| `PRISMA_LOG_QUERIES` | no | `true` to log every SQL query. |
| `BACKEND_URL` | frontend build | Where Next.js proxies `/api`. **Read at build time** (compose passes `http://backend:4000`). |

## Email words

Email confirmation and password reset use **Nigerian words** instead of numeric codes — names, places,
foods and animals such as `ikenna`, `kaduna`, `suya`. Emails show the word in lowercase; the site accepts
any capitalisation (`Ikenna`, `ikenna`, `IKENNA`).

- **Sign-up** sends one word (valid 30 min). Signup never fails because of mail; unconfirmed users see a reminder and can resend from `/verify-email`.
- **Forgot password** (`/forgot-password`) sends two words (valid 20 min) — two words because one word out of ~350 is too easy to guess.
- Only an HMAC of the word is stored, with expiry, 5 attempts per word, at most one email a minute and 5 an hour per account, plus IP limits.
- Accounts that existed before this upgrade are treated as confirmed.

## Ask without an account

Anyone can use **Ask** at `/chat`. Guests get one-off answers (not saved, no history sidebar) with a strict
per-IP limit (4 a minute, 15 an hour) and a prompt to sign in to save chats. Signed-in users keep saved
chats and the 60/hour limit.

Ask first does a keyword search over verified records (title, text, entity names and aliases; filler words
like "tell me about" are ignored), then adds semantic matches if embeddings are configured. If nothing
matches, it answers "no verified information" without calling the model. If the chat model fails, Ask
shows the real reason (bad key, wrong model, timeout) instead of pretending nothing was found.

**Long answers and proxy timeouts.** When Ask needs the model it starts a background job and returns at
once; the page then polls every 1.5 s (up to 3 minutes) for the answer. A RunPod cold start can take
1–2 minutes, so this stops Coolify/Traefik/Next from cutting the request (502/504) after RunPod has already
finished and billed. Jobs live in backend memory for 15 minutes (single backend replica). Raising the
Coolify/Traefik read timeout to 180 s or more is optional but still helps other long routes such as uploads.

## Chat, answers and sources

- **Chat permalinks.** Each saved conversation lives at `/chat/:id`, so a refresh (or a shared tab) reopens
  the same chat. `/chat` is a new conversation (and guest Ask); the first question creates the chat and the
  address bar moves to `/chat/:id`. Only the owner can open a chat; anything else goes back to `/chat`.
- **AI chat titles.** After the first answer, one tiny model call (≤ 24 tokens, no retrieval) names the chat
  in ≤ 6 words; it is refreshed once more after the 3rd question. Without a model (or on failure) the title
  stays the first question.
- **Answer votes and copy.** Each answer has Copy (answer text only). Signed-in users can thumbs up / down
  their own chat answers (`POST /api/chats/messages/:id/vote`, migration `0003_message_votes`); voting the
  same way again removes the vote.
- **Readable answers.** The system prompt asks for a short lead sentence and 2–4 sentence paragraphs; if a
  model still returns one long block, the backend splits it into paragraphs.
- **Source overlay.** Clicking a source opens it over the chat (blurred background, Esc / click outside to
  close) with an "Open in new page" button; ctrl/cmd-click still opens the record page.
- **No public verifier.** Record pages, cards, the public API and markdown exports no longer show who
  verified a record. The verifier is still stored and visible in the Workstation.
- **Explore tiles.** Tiles show a short excerpt from a random verified record linked to that entity (around
  the first mention of its name). No personalisation captions; ranking still adapts quietly. No AI on Explore.
  Tiles, entity pages and document cards no longer print "N verified records" (counts still drive ranking).
- **PERSON names** render bold in small caps on tiles, chips and entity pages.

## Documents, re-chunk and bulk review

Uploaded documents are split into records by heading and topic. Each extract carries a short
"About <subject> · <section>" line so it makes sense on its own (no orphaned "He was…" paragraphs).

In the **Workstation**:

- **Documents** tab → **Re-chunk** re-reads a stored file and splits it again with the current extractor.
  By default the document's old *pending* drafts are retired ("Superseded by re-chunk"). Verified records are never changed.
  **Review its records** opens the queue filtered to that document.
- **Review queue** has checkboxes, **Select page**, **Select all from this document**, and a bulk bar:
  **Verify selected** (asks for confirmation) and **Reject selected** (one shared reason required). Up to 100 at a time.

## Leaderboard

One general leaderboard for everybody, staff included, ranked by verified work, with milestones
(First record → Contributor → Chronicler → Historian → Archivist of the people). It shows no roles, and
public profiles show no role badges or review counts.

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
- Chat is rate-limited to 60 messages per user per hour, and 15 per IP per hour for guests.
- Entity suggestions in the Workstation are rule-based (honorifics, "… School", "… Party", known catalogue names), not AI.
