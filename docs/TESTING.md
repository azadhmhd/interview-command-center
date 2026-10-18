# Testing

| Suite | Command | What it covers | Needs |
|---|---|---|---|
| Unit | `pnpm test:unit` | task state machine & backoff, routing policy, deterministic planner, SM-2, milestone/quiet-hours scheduling, SSRF URL guard | nothing |
| API end-to-end | `pnpm test:e2e` | all 20 acceptance criteria through real HTTP against PostgreSQL + Redis, a fake OpenAI-compatible server, a stub Claude CLI, two-user isolation & sharing, auth flows | `pnpm infra:up` |
| UI end-to-end | `pnpm test:ui` | register → application → round → capture → prepare → practice → self-evaluate → library → dashboard in Chromium | running stack on :3000/:4000 |
| Typecheck | `pnpm lint` | strict TypeScript, both apps | — |

Notes
- E2E uses the database in `TEST_DATABASE_URL` (default `icc_test`, must end in `_test`) and Redis DB 1. Migrations
  are applied with `prisma migrate deploy`; every test creates its own users, so reruns don't need a reset.
- No real credentials are used: LLM tests run against an in-process OpenAI-compatible fake (`apps/api/test/helpers.ts`);
  the Claude Code adapter test uses `apps/api/test/fake-claude.js`, which also fails if app secrets leak into its env.
- UI tests: `npx playwright install chromium` once; `PW_CHANNEL=chrome` or `PW_EXECUTABLE=/path/to/chrome` to reuse a local browser.
  Point at another deployment with `E2E_BASE_URL`.
- Running the UI test against a stack with an LLM or Claude Code enabled creates real AI tasks (course generation,
  evaluation) and spends that provider's usage. Prefer a stack with `AGENT_CLAUDE_CLI_ENABLED=false` and no LLM.
- CI (`.github/workflows/ci.yml`) runs typecheck, unit, API e2e, builds, the Playwright smoke test and a Docker build.
