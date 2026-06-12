# Guia de desenvolvimento local — Docker, Prisma e companhia

> Para quem nunca usou Docker nem Prisma. Lê uma vez do início ao fim (15 min);
> depois usa só a secção **"Receitas do dia-a-dia"**.

---

## 1. O que é o Docker (em 1 minuto)

O backend precisa de três serviços para funcionar: uma base de dados (**PostgreSQL**), uma cache (**Redis**) e um armazenamento de ficheiros (**MinIO**). Instalar e configurar cada um à mão no Windows era um pesadelo.

O **Docker** resolve isso: corre cada serviço dentro de um **container** — uma caixa isolada com tudo lá dentro, pré-configurada. Conceitos:

| Termo | O que é | Analogia |
|---|---|---|
| **Imagem** | O "instalador" de um serviço (ex: `postgres:16-alpine`) | O CD de instalação |
| **Container** | Uma instância a correr dessa imagem | O programa aberto |
| **Volume** | Disco persistente do container — os dados sobrevivem a paragens | O disco rígido |
| **docker-compose.yml** | Ficheiro (já está no repo) que descreve os nossos 3 serviços | A receita |

**Tu nunca instalas o Postgres/Redis/MinIO.** O Docker descarrega as imagens e arranca os containers a partir do `docker-compose.yml`. Único pré-requisito: a app **Docker Desktop** aberta (ícone da baleia na barra de tarefas = "Engine running").

### Os nossos 3 containers

| Serviço | Porta | Para que serve |
|---|---|---|
| `postgres` | 5432 | Base de dados — residentes, medicação, tudo |
| `redis` | 6379 | Sessões, rate-limit, filas de jobs, websockets |
| `minio` | 9000 (+9001 consola web) | Ficheiros tipo S3 — fotos, PDFs DNR |

---

## 2. O que é o Prisma (em 1 minuto)

O **Prisma** é a camada entre o código TypeScript e o Postgres. Três peças:

1. **`prisma/schema.prisma`** — descreve as tabelas (Resident, Medication, …). É a fonte de verdade do schema, derivada do Notion §7.
2. **Migrações** (`prisma/migrations/`) — ficheiros SQL que transformam uma base de dados vazia no schema atual, passo a passo. Cada alteração ao schema gera uma migração nova. **Nunca se editam migrações já aplicadas/merged.**
3. **Prisma Client** — código TypeScript gerado a partir do schema (`prisma.resident.findMany()` com tipos). Regenera-se com `pnpm prisma generate`.

### Os dois utilizadores da base de dados (importante!)

| User | Quem usa | Porquê |
|---|---|---|
| `caresync` | **Só as migrações** (`prisma migrate`) | É o dono das tabelas (superuser do container) |
| `caresync_app` | **A aplicação e os testes** | NÃO é superuser — é isto que faz o Row-Level Security (isolamento entre Lares) funcionar. Um superuser ignora RLS e veria os dados de todos os Lares |

Isto já está configurado (`.env.example`, `docker/initdb/01-app-role.sql`). Só precisas de saber que existe — e que **nunca se muda a app para o user `caresync`**.

---

## 3. Setup inicial (uma vez por máquina)

```bash
# 1. Docker Desktop instalado e aberto (baleia = "Engine running")

# 2. Na pasta do projeto:
docker compose up -d          # arranca os 3 containers (1ª vez descarrega imagens, demora)
pnpm install                  # dependências do node
pnpm prisma migrate deploy    # cria as tabelas + RLS na base de dados
pnpm prisma db seed           # dados demo: Lar Bem-Estar + 4 users + 5 residentes
pnpm start:dev                # arranca a API em http://localhost:3000
```

Confirmação: abre http://localhost:3000/api/health → deve responder `{"status":"ok","checks":{"database":"up","redis":"up"}}`. Documentação da API: http://localhost:3000/docs.

---

## 4. Receitas do dia-a-dia

### Ligar o PC e começar a trabalhar

```bash
docker compose up -d     # liga os containers (se já estiverem ligados, não faz nada)
pnpm start:dev           # arranca a API em modo watch (recompila ao gravar)
```

> O Docker Desktop tem de estar aberto. Os containers ficam a correr em background — podes fechar o terminal.

### Acabar o dia

Nada obrigatório. Se quiseres libertar memória:

```bash
docker compose stop      # pára os containers (os DADOS FICAM — volumes persistem)
```

### Ver o que está a correr

```bash
docker compose ps        # lista os 3 serviços + estado (healthy = bom)
docker compose logs postgres --tail 20    # últimas 20 linhas de log de um serviço
```

### Correr os testes

```bash
pnpm test         # testes unitários (não precisam de Docker)
pnpm test:e2e     # testes contra o Postgres real (precisam dos containers ligados)
```

> Sem Docker ligado, os testes de RLS **saltam com um aviso** em vez de falhar — mas só contam de verdade quando correm contra a base real.

### Ver os dados na base de dados (visual)

```bash
npx prisma studio        # abre uma UI no browser para navegar nas tabelas
```

### Reset total da base de dados (a "solução universal")

Quando algo está esquisito na BD, ou depois de mudanças às migrações:

```bash
docker compose down -v        # pára containers E APAGA os dados (-v = apaga volumes)
docker compose up -d          # arranca de fresco
pnpm prisma migrate deploy    # recria as tabelas
pnpm prisma db seed           # repõe os dados demo
```

> ⚠️ `down -v` apaga TUDO o que está na base de dados local. Em dev não faz mal — o seed repõe o essencial em segundos.

---

## 5. Quando mexes no schema (`prisma/schema.prisma`)

Fluxo para alterar/adicionar tabelas ou campos:

```bash
# 1. Edita prisma/schema.prisma

# 2. Gera a migração (compara o schema com a BD e escreve o SQL):
pnpm prisma migrate dev --name descricao-da-mudanca

# 3. Regenera o client TypeScript (migrate dev já faz isto, mas se precisares):
pnpm prisma generate
```

Regras do projeto:

- Tabela nova com dados de um Lar → **tem de ter coluna `lar_id` + política RLS** na migração (SQL manual — vê o exemplo no fim de `prisma/migrations/20260612000000_init/migration.sql`).
- Mudanças ao schema têm de ser refletidas no **Notion §7 Modelo de Dados**.
- O agente `prisma-rls-guardian` revê qualquer alteração a `prisma/**` antes do merge.

---

## 6. Comandos Prisma — referência rápida

| Comando | O que faz | Quando usar |
|---|---|---|
| `pnpm prisma migrate deploy` | Aplica migrações pendentes (não cria novas) | Setup, depois de um `git pull` com migrações novas, depois de reset |
| `pnpm prisma migrate dev --name x` | Compara schema↔BD, **gera migração nova** e aplica | Quando MUDASTE o schema |
| `pnpm prisma db seed` | Corre `prisma/seed.ts` (dados demo, idempotente — pode correr 2x) | Depois de reset / primeira vez |
| `pnpm prisma generate` | Regenera o client TypeScript | Depois de mudar o schema (se o migrate não correu) |
| `npx prisma studio` | UI no browser para ver/editar dados | Inspecionar dados em dev |
| `npx prisma validate` | Verifica se o schema tem erros | Antes de commit de schema |

## 7. Comandos Docker — referência rápida

| Comando | O que faz | Dados? |
|---|---|---|
| `docker compose up -d` | Arranca os 3 serviços em background | mantém |
| `docker compose stop` | Pára (pausa) | mantém |
| `docker compose ps` | Estado dos serviços | — |
| `docker compose logs <serviço>` | Logs (postgres / redis / minio) | — |
| `docker compose restart postgres` | Reinicia um serviço | mantém |
| `docker compose down` | Pára e remove containers | mantém (volumes ficam) |
| `docker compose down -v` | Pára, remove containers **e apaga volumes** | ⚠️ APAGA |

---

## 8. Problemas comuns

**"docker: command not found" ou "Cannot connect to the Docker daemon"**
→ O Docker Desktop não está aberto. Abre-o e espera pelo "Engine running" (baleia estável).

**`/api/health` diz `"database":"down"`**
→ Containers desligados: `docker compose up -d` e espera ~10 segundos.

**Erro "role caresync_app does not exist"**
→ O volume do Postgres foi criado antes do script de init existir. Reset total (secção 4).

**Erro "port 5432 is already allocated"**
→ Tens outro Postgres a correr no Windows (instalado à mão?). Pára-o nos Serviços do Windows, ou muda a porta no `docker-compose.yml` (`'5433:5432'`) + `.env`.

**Testes e2e a falhar todos de repente**
→ 90% das vezes: BD em estado estranho. Reset total (secção 4).

**"migration ... failed to apply" depois de um git pull**
→ A migração nova entrou em conflito com o estado local. Em dev a resposta é sempre: reset total (secção 4).

---

## 9. Credenciais locais (só dev — NUNCA usar em produção)

| O quê | Valor |
|---|---|
| Postgres (app) | `caresync_app` / `caresync_app` |
| Postgres (migrações) | `caresync` / `caresync` |
| MinIO consola (http://localhost:9001) | `minioadmin` / `minioadmin` |
| Login demo (admin) | `helena@larbemestar.pt` / `demo-admin-123` |
| Login demo (enfermeira) | `sofia@larbemestar.pt` / `demo-nurse-123` |

Valores definidos em `docker-compose.yml`, `docker/initdb/01-app-role.sql` e `prisma/seed.ts`. Em produção tudo isto vem de variáveis de ambiente reais (ver `.env.example`).
