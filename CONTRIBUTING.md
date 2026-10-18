# Contributing

Thanks for your interest in Interview Command Center! Bug reports, docs fixes, new interview-topic content and code
contributions are all welcome.

## Ground rules

- Be kind — see the [Code of Conduct](CODE_OF_CONDUCT.md).
- Security issues go through [SECURITY.md](SECURITY.md), never public issues.
- Never commit secrets, real CVs or real interview data. Use the seed data or invented examples.
- The app must keep working **without any AI provider**. AI features are enhancements, not requirements.

## Development setup

Requirements: Node 22 (`.nvmrc`), pnpm 10, Docker.

```bash
git clone <your fork> && cd interview-command-center
cp .env.example .env     # set APP_ENCRYPTION_KEY (command in the file)
pnpm install
pnpm infra:up            # Postgres :5434, Redis :6380
pnpm db:migrate && pnpm db:seed
pnpm agent:install       # installs the agent skill pack into agent-workspace/
pnpm dev:api             # terminal 1
pnpm dev:worker          # terminal 2
pnpm dev:web             # terminal 3 → http://localhost:3000
```

## Project layout

| Path | What |
|---|---|
| `apps/api` | NestJS API + worker (`src/main.ts`, `src/worker.ts`), Prisma schema & migrations |
| `apps/web` | Next.js App Router UI |
| `skills/` | Agent skill pack sources, JSON schemas (generated), templates, installer |
| `docs/` | Architecture, setup, security, AI configuration, testing |

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before larger changes.

## Making a change

1. Open an issue first for anything non-trivial so we can agree on the approach.
2. Branch from `main`: `feat/<short-name>`, `fix/<short-name>` or `docs/<short-name>`.
3. Keep PRs focused; match the surrounding code style (TypeScript strict, small modules, Zod for validation).
4. Add or update tests:
   - pure logic → a `*.spec.ts` next to it (`pnpm test:unit`)
   - API behaviour → `apps/api/test/*.e2e-spec.ts` (`pnpm test:e2e`, needs `pnpm infra:up`)
   - UI flows → `apps/web/e2e` (Playwright, `pnpm test:ui` against a running stack)
5. Run `pnpm lint && pnpm test:unit && pnpm test:e2e` before pushing.
6. Database changes: edit `apps/api/prisma/schema.prisma`, then `pnpm --filter api prisma:dev --name <change>` and commit
   the generated migration.
7. Changing a task output schema (`apps/api/src/tasks/schemas.ts`)? Run `pnpm gen:schemas` to refresh the skill pack.
8. Update `CHANGELOG.md` under **Unreleased**.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `feat(api): add calendar export`, `fix(web): …`,
`docs: …`, `test: …`, `chore: …`.

## Adding interview content

The offline topic catalog lives in `apps/api/src/courses/catalog.ts`. New topics need: a stable `key`, round types,
keywords (for job-description matching), objectives, a concise original explanation, practice questions, criteria and
common mistakes. Write content in your own words — do not paste copyrighted course material.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
