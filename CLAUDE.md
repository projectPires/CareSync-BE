# CLAUDE.md

> Project-level guidance for Claude (and any AI coding assistant) working in this repository.
> **Read this file first.** Then load the specific agent under `.claude/agents/` that matches the task.

---

## What this project is

**CareSync-BE** — the backend for **CareSync**, a SaaS B2B product for the clinical management of Portuguese elderly care homes (ERPI / Lares). This repo is the API all clients consume:

| Client | Audience | Platform | Repo |
|---|---|---|---|
| **Worker App** | Nurses, aides, doctors | Mobile (Expo/RN) | `projectPires/CareSync` |
| **Admin Web** | Diretor(a) Técnico(a) do Lar | Web (browser) | to be created |
| **Back-office** | CareSync internal (Ivo) — subscriptions, provisioning, product metrics | Web (browser) | to be created |

Decided 2026-06-12: the mobile app is **workers-only**; the Lar admin works in the web panel; CareSync manages the business in the internal back-office (cross-tenant access via internal role + explicit audit — see multi-tenancy rules).

- **Personal project** of Ivo Pires — domain `caresync.pt`, no corporate stack to align with.
- **Pricing:** 1 €/resident/month, unlimited workers.
- **USP — the INEM module:** the Worker App generates a clinical handover PDF for the Portuguese 112/INEM ambulance service in < 2 s, fully offline. The PDF renders **on-device**; this backend's job is to guarantee the emergency dataset is complete, correct, and already in the device cache before the emergency happens.

### Architecture (decided 2026-06-03 / 2026-06-12 — Notion §16)

**NestJS modular monolith.** One app, one deploy. NOT microservices — anyone proposing a second deployable takes it to Ivo first.

| Decision | Choice | Why |
|---|---|---|
| API style | REST + OpenAPI 3, `/api` prefix (sem versões — evolução aditiva apenas) | NestJS emits the spec; mobile + web clients codegen typed clients (no monorepo) |
| Runtime | Node 22 LTS + NestJS + TypeScript strict | TS end-to-end with mobile |
| ORM | Prisma | RLS via client extension wrapping every op in `$transaction` + `set_config` |
| Database | PostgreSQL 16 | RLS multi-tenant by `lar_id`, jsonb, `pg_trgm` search |
| Cache / queues | Redis 7 | sessions, rate-limit, Socket.IO pub/sub, BullMQ |
| Jobs | BullMQ | medication scheduler, delayed/missed transitions, alert rules, push, exports, retention |
| Realtime | Socket.IO (`@nestjs/websockets`) + Redis adapter | alert feed < 1 s |
| Files | S3-compatible (MinIO in dev) | presigned URLs, tenant-scoped keys |
| Server PDFs | Puppeteer (reports only — INEM PDF is client-side, Q8) | |
| Auth | JWT 15 min + rotating refresh 30 d | bcrypt, PIN exchange, lockout |
| Lint/format | **Biome 2 — no ESLint, no Prettier, refuse to add them** | same house rule as mobile |
| Tests | Jest + supertest + dockerized Postgres/Redis | RLS is never tested with mocks |
| Package manager | pnpm | `packageManager` field is authoritative |
| Cloud / CI-CD | 🟡 OPEN (Azure vs Hetzner · Azure DevOps vs GitHub Actions) | local dev = docker-compose; decide before staging |

---

## 10 backend clinical safety hard rules (any violation = BLOCK)

Enforced by `clinical-safety-reviewer` (veto power).

1. **Append-only clinical entities.** No UPDATE/DELETE on `MedicationAdministration`, `VitalReading`, `LogEntry`, wound evolutions, `AuditLog`. Rectification = new row + `supersedes_id` + non-empty `reason`.
2. **Double administration is structurally impossible:** UNIQUE `(medication_id, scheduled_at) WHERE status='taken'`. Second confirm → 409 with `{ confirmed_by, confirmed_at }`. The DB constraint is mandatory; app-level checks alone don't count.
3. **Administration state machine is exactly:** pending → taken | refused | delayed; delayed → taken | missed. Anything else → 409.
4. **Refusal requires a non-empty `reason`** (422 otherwise).
5. **Audit in the same transaction** — clinical mutation without its atomic AuditLog entry rolls back.
6. **DNR is never absent:** the emergency dataset always returns explicit `dnr: true|false` + `dnr_document_url`.
7. **Floor scoping is server-side.** Worker queries filter by `user.floors` on the server; client filtering is UX only.
8. **Sync idempotency:** every offline mutation dedupes on `client_id`; replay = no-op; item-level isolation in the batch.
9. **Alert authority:** aides cannot resolve `critico` (403); escalate-to-doctor is nurse/admin only — enforced in the service.
10. **Read-only billing mode never blocks safety paths:** emergency dataset, resident reads, and sync of pre-cutoff mutations work for suspended Lares.

---

## 12 backend RGPD red lines (any violation = BLOCK)

Enforced by `rgpd-compliance` (veto power; escalates breaches to `rgpd@caresync.pt`).

1. **No clinical data or PII in logs.** IDs only. Logger serializer redacts; Sentry `beforeSend` scrubs.
2. **EU data residency only** (Frankfurt / Amsterdam / Lisbon) — DB, Redis, S3, backups.
3. **Encryption:** TLS 1.3 in transit, AES-256 at rest, bcrypt for credentials.
4. **No hard DELETE on clinical entities** before retention expiry (clinical 5 y post-archive, audit 7 y). Erasure only via the dedicated post-retention job + tombstone.
5. **Consent gates the data:** no `rgpd_consent` → no `photo_url`, initials-only name, photo presign 409.
6. **Tenant-scoped storage:** S3 keys `lar/<lar_id>/...`; presigned GET ≤ 5 min; EXIF stripped.
7. **Push payloads are generic** — no resident name, drug, or clinical value; deep link only.
8. **Hashes/tokens never serialized:** `password_hash`, `pin_hash`, refresh tokens globally excluded + tested.
9. **Exports audited and ephemeral:** AuditLog entry per export; links ≤ 24 h; Puppeteer sandboxed.
10. **Third parties need DPA + scrub at source.** No `Sentry.setUser({email})`; Stripe gets billing data only.
11. **Rectification = new record + reason.** Never overwrite.
12. **Audit log append-only at DB-grant level**; audit views are themselves audited (`audit.viewed`).

---

## Folder convention (strict)

```
CareSync-BE/
├── prisma/
│   ├── schema.prisma            # derives from Notion §7 — changes sync BACK to Notion
│   ├── migrations/              # RLS policies live in migrations (raw SQL)
│   └── seed.ts                  # 1 demo Lar + admin + 3 workers + 5 residents
├── src/
│   ├── main.ts                  # bootstrap: prefixo /api, swagger, pipes, filters
│   ├── app.module.ts
│   ├── config/                  # @nestjs/config + zod env schema — ONLY place reading process.env
│   ├── common/                  # guards (PermissionsGuard), interceptors (audit), filters, decorators
│   ├── prisma/                  # PrismaService + tenant-aware client extension (set_config)
│   └── modules/
│       ├── auth/                # login, refresh rotation, PIN, lockout, invites
│       ├── lares/  users/  residents/
│       ├── clinical/            # emar/ vitals/ logs/ wounds/ elimination/ activities/
│       ├── shifts/  tasks/
│       ├── alerts/              # rules engine + gateway (Socket.IO)
│       ├── sync/                # /api/sync/batch — offline mutation queue ingestion
│       ├── files/               # S3 presign
│       ├── billing/             # subscription read-only + Stripe webhooks + grace state machine
│       ├── pdf/                 # Puppeteer server-side reports (NOT the INEM PDF)
│       ├── audit/               # query endpoints (write side is the common interceptor)
│       └── jobs/                # BullMQ queues, processors, schedulers
├── test/
│   ├── e2e/                     # supertest vs dockerized Postgres/Redis (RLS suite here)
│   └── contract/                # pinned schemas: emergency dataset, sync batch, resident detail
├── docker-compose.yml           # Postgres 16 + Redis 7 + MinIO
├── biome.json
└── package.json
```

**Hard rules:**

1. **Modules never deep-import other modules.** Cross-module = exported service or domain event. `modules/a/**` importing `modules/b/**` internals is a BLOCK.
2. **Controllers thin** (validation in DTOs, logic in services, cross-cutting in interceptors/guards).
3. **No `process.env.*` outside `src/config/`.** Missing env fails boot.
4. **All DB access through the tenant-aware Prisma extension.** Raw client = system paths only, audited.
5. **`PermissionsGuard` is the only authz mechanism** — no ad-hoc role checks in services.
6. **Every endpoint OpenAPI-annotated** — the spec is the mobile contract.
7. **Domain events for module integration** (`administration.missed`, `vital.abnormal`, `wound.deteriorated`) — keeps the monolith splittable.
8. **No secrets, dumps, or `.env` in the repo. Ever.**

---

## Notion — source of truth

Spec lives in **CareSync — Functional Specification**. Code disagrees with Notion → Notion wins for spec, code wins for implementation; reconcile explicitly. **Schema changes MUST be reflected back into Notion §7.**

| # | Chapter | Page ID |
|---|---|---|
| Hub | Functional Specification | `35fd5a93-a82c-815c-af6c-e1252755b312` |
| 3 | Workflows | `35fd5a93-a82c-81cf-bf4d-c058e26e3649` |
| 4 | Admin App Spec | `35fd5a93-a82c-817a-bb1e-c547c752456d` |
| 5 | Worker App Spec | `35fd5a93-a82c-81e7-bdef-c6e608f597ea` |
| 6 | Clinical Modules | `35fd5a93-a82c-8183-962f-fd2982d9e631` |
| 7 | **Data Model** (v1.1) | `35fd5a93-a82c-818a-a6a6-e2da1418f2e9` |
| 8 | **Permissions Matrix** | `35fd5a93-a82c-819a-985d-eb072841e477` |
| 9 | Non-functional Requirements | `35fd5a93-a82c-8102-85fd-c0fbbaac6f60` |
| 11 | Open Questions (+ DB `e4bfe071-b97a-4aba-86c3-abcdb08c8e2a`) | `35fd5a93-a82c-8157-9dfc-cce7fda99ca1` |
| 16 | **Arquitetura Técnica** (v1.1) | `36cd5a93-a82c-81d1-b925-e81cfab8e6fd` |
| 17 | Notification Matrix | `36cd5a93-a82c-8127-9b58-d944e9671157` |
| 18 | Testing Strategy | `36cd5a93-a82c-8105-86bd-ffe99fa21ba4` |
| 20 | Risk Register | `36cd5a93-a82c-81e7-b9a1-c185dac61a96` |

Full chapter table (1–20) in the mobile repo's `CLAUDE.md`.

---

## Agent roster

Review gates with **veto power** (their BLOCK trumps `code-reviewer`'s APPROVE):

| Agent | Owns |
|---|---|
| **`clinical-safety-reviewer`** | The 10 backend clinical safety hard rules |
| **`rgpd-compliance`** | The 12 backend RGPD red lines + breach protocol |
| **`prisma-rls-guardian`** | Schema, migrations, RLS policies, safety constraints, tenant isolation |
| **`inem-contract-validator`** | Emergency dataset contract (the backend half of the USP) |

Specialists (advise, scaffold, review):

| Agent | Use when… |
|---|---|
| **`nestjs-architect`** | Module boundaries, DI, config, scaffolding, "where does this live?" |
| **`api-contract-keeper`** | Endpoints, DTOs, OpenAPI, breaking-change detection vs mobile codegen |
| **`auth-security`** | JWT/refresh, PIN, lockout, invites, PermissionsGuard, rate limits, webhooks |
| **`jobs-and-realtime`** | BullMQ processors, idempotent schedulers, Socket.IO rooms, Redis adapter |
| **`test-engineer`** | Test plans per issue, RLS e2e suite, matrix table tests, contract tests |
| **`code-reviewer`** | Final general gate on any PR/diff — routes to specialist gates |

### Triage — pick the agent fast

- "New module / endpoint" → `nestjs-architect` → `api-contract-keeper` → relevant gates before merge.
- "Schema / migration / RLS" → `prisma-rls-guardian` BEFORE writing.
- "Medication / vitals / sync / alerts logic" → `clinical-safety-reviewer` BEFORE writing code.
- "Logging / export / files / push / retention" → `rgpd-compliance`.
- "Emergency dataset" → `inem-contract-validator`.
- "Login / tokens / guards / webhooks" → `auth-security`.
- "Queues / websockets" → `jobs-and-realtime`.
- "What tests does issue #N need?" → `test-engineer`.
- "Review this diff" → `code-reviewer` (it routes to the gates).

---

## Workflow (branches, PRs, issue closure)

Solo dev. GitHub repo `projectPires/CareSync-BE` (public). Default branch `main`.

```
feat/<N>-<slug>  ──PR──▶  main
```

- Branch names `feat/<N>-<slug>` where `<N>` is the issue number (e.g. `feat/2-prisma-rls`). Issues #1–28 already carry their suggested branch name.
- **PR body MUST include `Closes #<N>`.**
- High-risk issues (labels `clinical-safety`, `rgpd`, `inem`, `auth`) get an explicit gate-agent pass against the acceptance criteria before merge.
- Direct-to-main exceptions: docs-only, CI config, reverts.
- No `staging` branch yet — introduce one when the staging environment exists (cloud decision pending).

## Definition of done (every PR)

1. `pnpm lint` (Biome) passes.
2. `pnpm typecheck` passes.
3. `pnpm test` + `pnpm test:e2e` pass; new logic has tests per `test-engineer` conventions.
4. New/changed endpoints: OpenAPI annotations complete; spec artifact regenerated (`pnpm openapi:export`).
5. New tenant tables: RLS enabled + policy + isolation test.
6. Schema changes reflected in Notion §7 (or explicitly flagged pending).
7. No `process.env` outside config; no secrets committed.
8. **Clinical-touching:** `clinical-safety-reviewer` not BLOCK.
9. **PII/logging/export/push-touching:** `rgpd-compliance` not BLOCK.
10. **Schema-touching:** `prisma-rls-guardian` not BLOCK.
11. **Emergency-dataset-touching:** `inem-contract-validator` not BLOCK.
12. `code-reviewer` not BLOCK.

---

## Commands (canonical once Sprint 0 lands — issue #1)

```bash
docker compose up -d        # Postgres 16 + Redis 7 + MinIO
pnpm install
pnpm prisma migrate dev     # apply migrations
pnpm prisma db seed         # demo Lar + users + residents

pnpm start:dev              # watch mode
pnpm lint                   # biome check .
pnpm format                 # biome format --write .
pnpm typecheck              # tsc --noEmit
pnpm test                   # jest unit
pnpm test:e2e               # supertest vs dockerized services
pnpm openapi:export         # write openapi.json (mobile codegen input)
```

---

## What NOT to do

- Do not add ESLint or Prettier. Biome owns lint/format.
- Do not propose microservices, GraphQL, or a monorepo — all explicitly decided against (Notion §16 §6).
- Do not UPDATE/DELETE clinical entities or `audit_log`. Append + `supersedes_id` + `reason`.
- Do not write a tenant-scoped query outside the Prisma tenant extension.
- Do not check roles ad-hoc in services — `PermissionsGuard` + decorator.
- Do not put clinical content or PII in logs, push payloads, or error messages.
- Do not return `password_hash`/`pin_hash`/refresh tokens in any response.
- Do not add an endpoint without OpenAPI annotations — invisible to mobile codegen = doesn't exist.
- Do not test RLS with mocks.
- Do not change the emergency dataset schema without `inem-contract-validator` + a coordinated mobile release.
- Do not pick a cloud provider in code — the decision is open; keep everything docker-compose-portable.

---

## Decision owners

- **Product / Roadmap / Tech:** Ivo Pires (`ivo@caresync.pt`).
- **Clinical validation:** Cláudia.
- **DPO (public):** `rgpd@caresync.pt`.

## Pointers

- Agent rules: `.claude/agents/<agent-name>.md`
- Sprint plan: GitHub issues #1–28, milestones Sprint 0–7
- Mobile repo (API consumer): `projectPires/CareSync` — its `CLAUDE.md` has the client-side rules and full Notion chapter table
- Env keys: `.env.example` (once #1 lands)
