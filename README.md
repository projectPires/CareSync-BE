# CareSync-BE

Backend for **CareSync** — a SaaS B2B product for the clinical management of Portuguese elderly care homes (ERPI / Lares de Idosos). Workers (nurses, aides, doctors) register care in real time through 8 clinical modules; admins manage residents, staff, shifts and tasks; the **INEM module** (the USP) hands a clinical PDF to 112 ambulance crews in under 2 seconds, fully offline.

The mobile apps (Admin + Worker, Expo / React Native) live in [`projectPires/CareSync`](https://github.com/projectPires/CareSync). This repo is the API they consume.

## Architecture

**NestJS modular monolith** — one app, one deploy.

| | |
|---|---|
| API | REST + OpenAPI 3, `/v1` — mobile generates its typed client from the spec |
| Runtime | Node 22 LTS · NestJS · TypeScript strict |
| Database | PostgreSQL 16 with **Row-Level Security** — multi-tenant by `lar_id` on every table |
| ORM | Prisma (tenant-aware client extension: every op in a transaction + `set_config('app.current_lar_id', …, true)`) |
| Cache / queues | Redis 7 — sessions, rate-limit, Socket.IO pub/sub, **BullMQ** jobs |
| Realtime | Socket.IO (`@nestjs/websockets`) + Redis adapter — alert feed < 1 s |
| Files | S3-compatible storage (MinIO in dev), presigned URLs, tenant-scoped keys |
| Auth | JWT 15 min + rotating refresh 30 d · PIN exchange · lockout · invite flow |
| Server PDFs | Puppeteer (inspection/portability reports — the INEM PDF renders on-device) |
| Lint / tests | Biome 2 · Jest + supertest against dockerized Postgres (RLS is never mocked) |

Key invariants the codebase is built around:

- **Append-only clinical data** — rectifications create new rows with a reason; the audit log has no UPDATE/DELETE at the DB-grant level.
- **Double medication administration is structurally impossible** — `UNIQUE (medication_id, scheduled_at) WHERE status = 'taken'`.
- **Offline-first sync** — the mobile app queues mutations for ≥ 2 h offline; `/v1/sync/batch` ingests them idempotently via client-generated `client_id` keys.
- **RGPD Art. 9** — health data: EU residency, encryption, consent gating, 5-year retention, no PII in logs or push payloads.

## Getting started

> Scaffold lands with [issue #1](https://github.com/projectPires/CareSync-BE/issues/1) (Sprint 0). Until then this repo holds docs + agent definitions.

```bash
docker compose up -d        # Postgres 16 + Redis 7 + MinIO
pnpm install
pnpm prisma migrate dev
pnpm prisma db seed         # demo Lar + admin + workers + residents
pnpm start:dev
```

API docs at `http://localhost:3000/docs` (Swagger UI), spec at `/openapi.json`.

```bash
pnpm lint          # biome check
pnpm typecheck     # tsc --noEmit
pnpm test          # unit
pnpm test:e2e      # supertest vs real Postgres/Redis (incl. RLS isolation suite)
pnpm openapi:export
```

## Project plan

- **Spec (source of truth):** Notion — *CareSync — Functional Specification* (data model, permissions matrix, NFRs, architecture). Page IDs in [CLAUDE.md](CLAUDE.md).
- **Sprint plan:** [issues #1–28](https://github.com/projectPires/CareSync-BE/issues) across 8 milestones (Sprint 0 Foundations → Sprint 7 Hardening), ~16 weeks.
- **Workflow:** `feat/<issue#>-<slug>` → PR to `main` with `Closes #N`. High-risk labels (`clinical-safety`, `rgpd`, `inem`, `auth`) get a gate-agent review pass.

## AI-assisted development

This repo is set up for agent-driven development. [CLAUDE.md](CLAUDE.md) carries the hard rules (10 clinical safety rules, 12 RGPD red lines, folder conventions); `.claude/agents/` defines 10 specialized agents — four of them review gates with veto power (`clinical-safety-reviewer`, `rgpd-compliance`, `prisma-rls-guardian`, `inem-contract-validator`).

## License & ownership

Personal project of Ivo Pires. Clinical validation: Cláudia. DPO contact: `rgpd@improxy.pt`.
