# CareSync-BE

Backend da **CareSync** — plataforma SaaS B2B para a gestão clínica de Estruturas Residenciais para Pessoas Idosas (ERPI / Lares de Idosos) em Portugal. Os workers (enfermeiros, auxiliares, médicos) registam cuidados em tempo real através de 8 módulos clínicos; o Admin do Lar gere residentes, equipa, turnos e tarefas; o **módulo INEM** (o USP) entrega uma ficha clínica em PDF à equipa do 112 em menos de 2 segundos, totalmente offline.

## Clientes desta API

| Cliente | Audiência | Plataforma | Repo |
|---|---|---|---|
| **Worker App** | Enfermeiros, auxiliares, médicos | Mobile (Expo / React Native) | [`projectPires/CareSync`](https://github.com/projectPires/CareSync) |
| **Admin Web** | Diretor(a) Técnico(a) do Lar — residentes, workers, turnos, tarefas, faturação | Web (browser) | a criar |
| **Back-office CareSync** | Interno (produto) — subscrições, provisioning de Lares, métricas | Web (browser) | a criar |

A app móvel é **exclusiva dos workers**. Toda a gestão do Lar acontece no painel web; a gestão do negócio CareSync acontece no back-office interno (acesso cross-tenant auditado).

## Arquitetura

**Monolito modular NestJS** — uma app, um deploy.

| | |
|---|---|
| API | REST + OpenAPI 3, `/v1` — os clientes geram clientes tipados a partir do spec |
| Runtime | Node 22 LTS · NestJS · TypeScript strict |
| Base de dados | PostgreSQL 16 com **Row-Level Security** — multi-tenant por `lar_id` em todas as tabelas |
| ORM | Prisma (extensão tenant-aware: cada operação em transação + `set_config('app.current_lar_id', …, true)`) |
| Cache / filas | Redis 7 — sessões, rate-limit, pub/sub Socket.IO, jobs **BullMQ** |
| Realtime | Socket.IO (`@nestjs/websockets`) + adapter Redis — feed de alertas < 1 s |
| Ficheiros | Storage S3-compatible (MinIO em dev), URLs presigned, chaves por tenant |
| Auth | JWT 15 min + refresh rotativo 30 d · troca por PIN · lockout · convites |
| PDFs servidor | Puppeteer (relatórios de inspeção/portabilidade — o PDF INEM é gerado no dispositivo) |
| Lint / testes | Biome 2 · Jest + supertest contra Postgres dockerizado (RLS nunca é testado com mocks) |

Invariantes centrais do código:

- **Dados clínicos append-only** — retificações criam novo registo com motivo; o audit log não tem UPDATE/DELETE ao nível da base de dados.
- **Dupla administração de medicação é estruturalmente impossível** — `UNIQUE (medication_id, scheduled_at) WHERE status = 'taken'`.
- **Sync offline-first** — a app móvel guarda mutations ≥ 2 h offline; `/v1/sync/batch` ingere-as de forma idempotente via chaves `client_id` geradas no dispositivo.
- **RGPD Art. 9** — dados de saúde: residência UE, encriptação, consentimento, retenção de 5 anos, zero PII em logs ou notificações push.

## Começar

> O scaffold chegou com a [issue #1](https://github.com/projectPires/CareSync-BE/issues/1) (Sprint 0).

```bash
docker compose up -d        # Postgres 16 + Redis 7 + MinIO
pnpm install
pnpm prisma migrate dev
pnpm prisma db seed         # Lar demo + admin + workers + residentes
pnpm start:dev
```

Documentação da API em `http://localhost:3000/docs` (Swagger UI), spec em `/openapi.json`.

```bash
pnpm lint          # biome check
pnpm typecheck     # tsc --noEmit
pnpm test          # unit
pnpm test:e2e      # supertest vs Postgres/Redis reais (inclui suite de isolamento RLS)
pnpm openapi:export
```

## Plano do projeto

- **Spec (fonte de verdade):** Notion — *CareSync — Functional Specification* (modelo de dados, matriz de permissões, NFRs, arquitetura). IDs das páginas em [CLAUDE.md](CLAUDE.md).
- **Plano de sprints:** [issues #1–28](https://github.com/projectPires/CareSync-BE/issues) em 8 milestones (Sprint 0 Foundations → Sprint 7 Hardening), ~16 semanas.
- **Workflow:** `feat/<issue#>-<slug>` → PR para `main` com `Closes #N`. Labels de alto risco (`clinical-safety`, `rgpd`, `inem`, `auth`) passam por revisão dos agentes-gate.

## Desenvolvimento assistido por IA

Repo preparado para desenvolvimento orientado a agentes. O [CLAUDE.md](CLAUDE.md) contém as regras duras (10 regras de segurança clínica, 12 linhas vermelhas RGPD, convenções de pastas); `.claude/agents/` define 10 agentes especializados — quatro deles gates de revisão com poder de veto (`clinical-safety-reviewer`, `rgpd-compliance`, `prisma-rls-guardian`, `inem-contract-validator`).

## Propriedade

Projeto pessoal de Ivo Pires. Validação clínica: Cláudia. Contacto DPO: `rgpd@caresync.pt`.
