# Aphring: what changed

This build implements the agreed blueprint on top of the previous Aphring codebase. Every phase
below is implemented and was checked against a live Postgres + pgvector database. Stubs and
deferrals are listed at the end.

---

## Phase 1: security, roles, data integrity (complete)

**Accounts and roles**
- Removed the seeded `admin@aphring.com` / `admin123456` account. The seed now creates only the place catalogue.
- Users register with a unique **username** and can log in with username or email.
- `ADMIN_USERNAMES` (comma-separated) defines the admins. Roles are re-read from the database on every
  request, and `syncRole` grants or removes admin according to the env list. Removing a name demotes that user on their next request, and both events are audit-logged.
- **Moderators**: an admin invites an existing username (Workstation → People). The user accepts or declines on
  `/me`. Admins can revoke the role. Invites, accepts and revokes are audit-logged.
- `JWT_SECRET` must be ≥ 32 characters in production or the server refuses to start. Tokens no longer
  carry trusted role claims.
- Auth routes are rate-limited (30 / 15 min), as are chats (60 / hour / user) and the global API.

**Database**
- Migrations via `prisma migrate deploy` on container start.


**Public API and privacy**
- Public lists and record pages return **VERIFIED records only**. Owners can see their own pending and rejected records on `/me`.
- Public payloads never include emails, storage paths or internal IDs of documents beyond the download route.
- Source downloads are served through `/api/documents/:id/download`, with access checks. Raw paths are not exposed.

**Workstation (admins + moderators) at `/workstation`** (replaces `/admin`; old URL redirects)
- **Review queue**: filter by status, search, open a record, and edit title, content, category and normalised place.
  Rule-based entity suggestions are pre-filled and can be added, removed or retyped. Actions are **Verify & publish**,
  **Reject** (a reason is required and sent to the contributor) and **Move to pending**. Edits made during review create revisions.
- **Corrections**: side-by-side current and proposed text. Accepting applies TITLE, CONTENT or PLACE automatically
  and creates a revision; the text can be edited before applying. Rejecting requires a note.
- **Reports**: dismiss, resolve, or resolve and unpublish (with a reason).
- **Entities**: browse by type, rename, retype, edit description and aliases, merge duplicates. Admins can delete.
- **People** (admin only): user list, invite, cancel invite, revoke moderator. The env-admin flag is shown.
- **Ops** (admin only): admins list, embedding coverage with an "embed waiting records" button,
  chat/STT configuration, and the audit log.

**Votes**
- Voting runs in one DB transaction: create, switch or remove a vote, recount, and adjust source rank and the author's reputation.
  Self-voting is blocked.
- **Votes never change a record's status.** Only staff verify.

**Embeddings**
- A record is embedded **once, when verified**, and re-embedded only if its title or content hash changes.
  Pending content is never embedded.
- There are no fake vectors in production. `ALLOW_FAKE_EMBEDDINGS` works only outside `NODE_ENV=production`.
  Without an embedding key, chat falls back to keyword search over verified records.
- Ops → "Embed waiting records" backfills after a key is added.

**Ingestion**
- DOCX through `mammoth` (the old build read DOCX as garbage). PDF through `pdf-parse`, plus TXT/MD. `.doc` is rejected
  with a clear message.
- `cleanText` normalises whitespace, hyphenation and page furniture. Paragraphs shorter than 160 characters are merged
  so one document produces sensible records rather than one per line.
- Uploads are capped at 20 MB for documents and 25 MB for audio. Each paragraph-record keeps a citation to its source document and paragraph.

**Operations**
- Prisma **migrations** (`prisma/migrations/0001_init`) replace `db push`. Startup runs `migrate deploy` and
  prints the upgrade command if it fails.
- `.env.example`, `docker-compose.yml` and the README document every variable. SQL query logging is opt-in (`PRISMA_LOG_QUERIES`).

## Phase 2: free-text place, normalisation, Explore types (complete)

- No community picker. Contributors type a **place** freely (e.g. "item, bende"). Moderators normalise it in the
  review form. On verify it is matched by name or alias to a catalogue place, or a new PLACE entity is created.
- **Rule-based entity suggestions** (no AI): honorific + name → person; "… School/College/University" →
  institution; "… Party/Council/Ministry" → organisation; "… Festival/War/Election" → event; known catalogue
  names are matched in the text.
- Each knowledge category (history, politics, traditional, education, culture, government, person, event) joins a TOPIC shelf.
- `/community/*` redirects to `/explore`, and `/api/communities` returns 410. Public community pages are gone, so there are no empty pages.

## Phase 3: dynamic, personalised Explore (complete)

- Explore is built from the verified index only, with **no AI calls**.
  - Shelves: Public figures, Places, Schools & institutions, Organisations, Events, Topics, then source documents and recently verified records.
  - An entity appears only once at least one verified record links to it, so a shelf never shows zero records.
- **Personalisation**: searches (+1), records used in chat answers (+1), upvotes (+2), downvotes (−1) and saves (+2)
  add weight to the linked entities, with a 30-day half-life.
  - Ranking: `0.4·affinity + 0.3·quality + 0.2·recency + 0.1·diversity`, plus a small per-user, per-day jitter, so two users rarely see
    the same page, but one user's page stays steady through a day.
  - A **For you** shelf appears once there is enough signal. Users can reset their personalisation on `/me`.
- `/explore/[type]` shows the full shelf. `/explore/[type]/[slug]` is the entity page, with its records and related entities.
- Explore search covers entities and records.

## Phase 4: social layer (complete; see notes)

- **Feed** (`/feed`): Recent, Top and For you tabs, paginated.
- **Record actions**: upvote/downvote, save, share (native share sheet or copy link), download as Markdown,
  download the original source file, report.
- **Corrections only, no comments**: propose a fix to title, content, place, entities or other, with a reason. Moderators review it.
- **Badges and milestones**, derived on read from **verified work only**:
  - verified records (1 / 5 / 25 / 100 / 500)
  - verified words (500 / 5k / 25k / 100k)
  - verified source files (1 / 5 / 25 / 100)
  - upvotes received (10 / 100 / 1000)
  - accepted corrections (1 / 10 / 50)
  - plus role badges.

  `/me` shows progress bars to the next badge.
- **Leaderboard** (`/leaderboard`): all-time or this month. Score = 5 × verified records + upvotes received.
  Staff are listed separately so moderators don't crowd out contributors.
- Public profile pages are at `/u/[username]`.
- Ask Aphring now shows each answer's **source records as links**.

---

## Deferred / known limitations

- **Token storage**: the JWT is still kept in `localStorage`, as in the original. Moving to httpOnly cookies
  needs CSRF handling and is the next security step.
- **OCR**: scanned (image-only) PDFs produce no text and are rejected with a message. Tesseract or a vision API is not wired in.
- **Reputation on delete**: when an admin deletes a verified record, upvote reputation already credited to the author is not reversed.
- `/explore/[type]` shows at most 40 entities. There is no pagination yet.
- Correction fields ENTITIES and OTHER are accepted as notes. A moderator applies them by hand in the review form.
- Badges are computed on read. That is fine at current scale; cache or materialise them if the user count grows large.
- Notifications for "your record was verified/rejected" are not built. Contributors see status and the moderator's note on `/me`.
- `trust proxy` is set to 1 hop. If you put another proxy in front of Coolify's, raise it so rate limits key on the real client IP.
- The frontend's `BACKEND_URL` is baked in at build time (Next.js rewrites). Compose already passes it as a build arg.
