# Interview Command Center — Architecture

## Shape

Modular monolith, three processes, one codebase per tier.

```
┌──────────────┐   /api/* rewrite   ┌──────────────────────┐      ┌────────────┐
│  web (Next)  │ ─────────────────▶ │  api (NestJS, REST)  │ ───▶ │ PostgreSQL │  source of truth
│  App Router  │   same-origin      │  auth, CRUD, routing │      └────────────┘
└──────────────┘   session cookie   └─────────┬────────────┘            ▲
                                              │ enqueue {taskId}        │
                                              ▼                         │
                                        ┌──────────┐   lease+execute    │
                                        │  Redis   │ ◀───────────────┐  │
                                        │ (BullMQ) │                 │  │
                                        └──────────┘          ┌──────┴──┴───┐
                                                              │   worker    │  same Nest code,
                                                              │ tick + jobs │  different entrypoint
                                                              └──────┬──────┘
                                                                     │ OpenAI-compatible HTTP
                                                                     ▼
                                                     Ollama / vLLM / LM Studio / hosted
```

- **web** — Next.js 16 (App Router, TS strict, Tailwind 4, shadcn-style components, SWR). Calls the API through a
  same-origin rewrite, so the httpOnly session cookie never leaves the origin and no token sits in JS.
- **api** — NestJS 11 + Prisma 6. Every request resolves `(user, workspace, role)` in a guard; every query is scoped by
  `workspaceId` server-side. Swagger at `/api/docs`.
- **worker** — `src/worker.ts`, same modules. Consumes BullMQ `tasks` jobs and runs a 30s scheduler tick.
- **PostgreSQL** holds every business record including task state. Redis only carries "please run task X" messages.
  Losing Redis loses nothing: the tick re-enqueues anything queued/due from the database.

## Key decisions

| Decision | Why |
|---|---|
| Opaque session tokens (SHA-256 hashed in `Session`) in an httpOnly SameSite=Lax cookie | Revocable, no JWT key management, no token in JS. |
| `crypto.scrypt` for passwords, AES-256-GCM for stored API keys | Stdlib; no native build deps. |
| Postgres FTS (generated `tsvector` + GIN) | Spec: no vector DB for v1. |
| Tags as `text[]` + GIN instead of Topic/QuestionTopic tables | Same query power, two fewer tables. |
| `AnswerAttempt` covers practice + mock attempts; `AnswerEvaluation` 1:1 per attempt | Avoids parallel PracticeAttempt table. |
| Reminders model prep milestones; `AgentTask` models any AI/agent work | Deterministic scheduling never touches the LLM path. |
| Deterministic baseline course (round-type topic catalog + user history + time-boxed schedule) created instantly; AI enriches it | The core feature still works with `LLM_ENABLED=false`. |
| One OpenAI-compatible client (`openai` SDK, `baseURL`) | No provider-specific business logic. JSON mode is detected, not assumed. |
| Claude Code headless adapter (`claude -p`) is opt-in and off by default | It is a documented CLI mode; it runs on the host only, inside the task's sandbox dir. Everything else is manual handoff. |
| No code execution | Coding answers are reviewed (AI or rubric), never executed. A sandbox container is the upgrade path. |
| NestJS 11 / Prisma 6 / TS 5.9 instead of the newest majors | Still maintained; stable APIs. Upgrade path documented in `KNOWN_LIMITATIONS.md`. |

## Authorization model

- `Workspace` + `WorkspaceMembership(role: OWNER|EDITOR|VIEWER)`. Each user gets a private personal workspace on register.
- `WorkspaceGuard` reads `x-workspace-id` (falls back to the personal workspace), verifies membership, attaches role.
  Writes need EDITOR+, member management needs OWNER.
- `RecordShare(resourceType, resourceId, granteeId, permission)` grants access to **one** record (application or course)
  to a user outside the workspace. Shared courses are served through `/shared/*` endpoints that return only the course
  and its lessons — never the source application, rounds or answers. Revocation sets `revokedAt` and is checked on every read.
- Audit events for login, password reset, membership/share changes, LLM config changes, exports and account deletion.

## Task state machine

```
scheduled ──▶ queued ──▶ running ──▶ completed
    │           │  ▲        │  │
    │           │  │        │  └──▶ awaiting_review ──▶ completed
    │           │  └─ retry_wait ◀──┘ (bounded, exp. backoff)
    │           ▼                    └──▶ failed ──▶ queued (manual retry)
    └──────▶ ready_for_agent ──▶ submitted ──▶ awaiting_review/completed (validated import)
any non-terminal ──▶ cancelled
```

Transitions are enforced in `apps/api/src/tasks/state-machine.ts`. Leases (`leaseOwner`, `leaseExpiresAt`) are taken with a
conditional `updateMany`, so two workers cannot run one task. Expired leases are recovered by the tick. `idempotencyKey`
is unique; outputs are written in one transaction keyed by task id so a retried task or a re-imported file creates no duplicates.

## Routing

`apps/api/src/tasks/routing.ts` picks `llm | agent_cli | agent_manual | deterministic` per task type from workspace
settings + live availability, records the reason on the task, and never silently switches providers. If nothing is
available the task waits in `ready_for_agent` with instructions to resume.

## Directory map

```
apps/api/prisma         schema, migrations, seed
apps/api/src/common     guards, crypto, decorators, audit
apps/api/src/<module>   auth, workspaces, profile, resumes, applications, rounds, questions,
                        knowledge, llm, courses, practice, tasks, scheduler, agents, dashboard, account
apps/api/test           e2e acceptance tests (real Postgres) + fake OpenAI-compatible server
apps/web/src/app        pages
skills/                 agent skill pack (source) + JSON schemas + installer
agent-workspace/        task packages exchanged with coding agents (gitignored contents)
```
