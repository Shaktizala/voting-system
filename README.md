# TeamVote — Dynamic Team Voting & Evaluation System

A secure, real-time web app for post-presentation team evaluation: an admin sets up
participants, teams and evaluation rooms with **room-specific scoring categories**,
moderators drive live voting rounds, participants vote from any device, and results,
rankings and analytics update live with CSV/XLSX exports.

## Stack

| Layer      | Tech                                                                 |
|------------|----------------------------------------------------------------------|
| Frontend   | React 18 + TypeScript, Vite, Tailwind CSS, TanStack Query, Recharts, Socket.IO client |
| Backend    | Express 4 + TypeScript (routes → services → repositories), Socket.IO, Zod |
| Database   | PostgreSQL 16 + Prisma ORM                                           |
| Realtime   | Socket.IO (polling fallback + 8s snapshot polling; optional Redis adapter for multi-instance) |
| Security   | Argon2id password hashing, httpOnly cookie sessions, CSRF double-submit, RBAC, DB triggers, audit log |
| Import     | CSV (papaparse) / XLSX (exceljs) participant import                  |
| Testing    | Vitest + Supertest integration tests, Playwright E2E                 |

## Repository layout

```
packages/shared   Zod DTOs, role/permission matrix, contracts shared by client & server
server            Express API, Prisma schema/migrations, seed, integration tests
web               React frontend + Playwright E2E
docs              DESIGN.md (architecture & rule specification), openapi.yaml (API reference)
```

## Quick start (local dev)

```bash
npm install                       # installs all workspaces
npm run db:up                     # postgres + redis via docker compose
cp .env.example server/.env       # then edit if needed
npm run db:migrate                # prisma migrate dev
npm run db:seed                   # sample users, teams, rooms with different categories
npm run dev                       # API on :4000 (tsx watch) + web on :5173
```

Seed accounts (passwords shown in seed output):

| Role        | User       | Password          |
|-------------|------------|-------------------|
| Admin       | `admin`    | `Admin123!`       |
| Moderator   | `moderator1`| `Modordion123!`  |
| Participants| `alice`, `ben`, `carla`, `dmitri`, `elin`, `femi`, `gita` | `Participant123!` |

Participants `gita` has no team (she is a judge and can vote for any team).
The two seeded rooms have **different category sets** on purpose (category
configurations are per-room).

### Full Docker run

```bash
docker compose up -d --build      # postgres + redis + server (API :4000)
npm run dev -w web                # vite on :5173 (or build & serve web/dist statically)
```

The `server` service runs `prisma migrate deploy`, seeds (first boot), and starts
the compiled API.

## Scoring model (enforced server-side)

- Every round presents **one team**; eligible voters score it on the room's
  current categories. Category configuration is versioned: a round snapshots the
  config version it opened with, so later config edits never rewrite history.
- Scores must satisfy `min ≤ score ≤ max` and align to `step` (validated in the
  API *and* by PostgreSQL triggers — cheating the API does not bypass the rules).
- **Self-votes are impossible** (membership check inside a row-locked transaction
  plus a DB trigger).
- One vote per (round, voter): resubmission *updates* the existing vote with a
  revision counter (audited). Editing is disabled per-room via
  `settings.allowVoteEdit`.
- Structural category changes are **locked once votes exist** in a room; admin
  then starts a new config version which deep-copies the categories.
- Voting only happens on **OPEN** rounds (select → open → pause/resume → close);
  admins can re-open closed rounds (audited). A room has **at most one live
  round** (enforced by a partial unique index), and closing a round waits for
  in-flight votes, so no vote is ever accepted after the close.

### Live-event capacity

Votes on the same round run in parallel (shared row lock); the close/pause
transition takes the exclusive lock. Transient DB errors return `503` +
`Retry-After` and the client retries automatically (submissions are
idempotent). Tune `DB_POOL_SIZE` for very large rooms; see `.env.example`.

### Result arithmetic

For each team and category:

```
category average = mean of submitted scores (or trimmed mean strategy)
normalized      = (average − min) / (max − min)
overall         = Σ(weightᵢ × normalizedᵢ) / Σ(weightᵢ) × 100
```

Votes with missing categories are excluded from that category's average only.
Tie-break order: (1) higher overall, (2) higher normalized score in the
highest-weighted category, (3) more votes received, (4) shared rank.
Weighted-mean is the default aggregation; `trimmed_mean` (drops one high + one
low per category when ≥3 scores) is selectable per room.

Results are hidden from participants until an admin publishes them (per-room
`results/publish`), unless the room enables `liveResults`.

## API reference

[`docs/openapi.yaml`](docs/openapi.yaml) documents every REST endpoint
(auth, participants & import, teams, rooms, categories & config versions,
rounds, votes, progress, results & exports, audit, realtime events).

## Testing

```bash
npm test            # server: integration tests incl. 150-voter burst + race tests (real Express + Postgres; needs docker db up)
npm run test:e2e    # Playwright E2E: full admin → participant voting journey
```

The integration suite boots the real app on port 4005 and covers auth/RBAC,
room isolation, self-vote + range DB triggers, idempotent vote editing,
concurrency, config locking, result arithmetic and CSV injection escaping.

## Security notes

- Passwords: Argon2id (19 MiB, t=2 — OWASP baseline; older hashes upgrade on
  login); sessions: httpOnly SameSite cookies with hashed tokens in the
  `sessions` table, sliding expiry while in use; login lockout after 10
  failures per account (5 min, cleared by an admin password reset).
- Temporary passwords: the API itself refuses everything except the auth
  endpoints until the user sets their own password.
- Rate limits are **per signed-in account**, not per IP, so a whole venue on
  one Wi-Fi router (one public IP) is never throttled together; only anonymous
  traffic is limited per IP, with venue-sized ceilings. Set `TRUST_PROXY` to
  match your proxy chain (default: loopback only) so `X-Forwarded-For` can't be
  spoofed; an account-wide cap (50 failures from any IP) backs up the lockout.
- Every mutating request requires the `X-CSRF-Token` header matching the
  `csrf` cookie (double-submit).
- RBAC: permissions are data-driven (`packages/shared/src/permissions.ts`);
  moderators only act inside rooms they are assigned to — other rooms 404, so
  existence is hidden (no IDOR probing). Participants only see their own
  rooms; join codes are shown to admins and the room's moderators only;
  unpublished results are admin/moderator only.
- Exports escape CSV formula injection (`=`, `+`, `-`, `@` cell prefixes are
  neutralized).
- Uploads/imports are capped (`IMPORT_MAX_FILE_MB`, `IMPORT_MAX_ROWS`).

## Admin workflow cheat-sheet

1. **Participants** — create users individually or import CSV/XLSX
   (`name, username, email, team`); temp accounts get `mustChangePassword`.
2. **Teams** — organization teams; room teams control presentation order.
   Bulk import a CSV of teams and members (`team_name` repeated per participant),
   optionally linking every imported team to a room and adding those members to
   that room in the same step.
3. **Rooms** — create a room (DRAFT), add categories (dynamic: name, min/max,
   step, weight, required), link teams, assign participants
   (RESTRICTED = assigned only; OPEN_WITH_CODE = anyone with the code joins and
   inherits their org team), then **Activate**.
4. **Live** — open the room's live dashboard, select the presenting team,
   **Open voting** (pause/resume as needed), watch progress, **Close round**,
   repeat for every team via *Present this team*.
5. **Results** — rankings with tie-break details, per-category charts,
   per-round filter, publish/unpublish, exports (CSV/XLSX summary, per-category,
   raw votes). Everything is recorded in the **audit log**.
