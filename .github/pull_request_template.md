## What & why

<!-- What does this change and why? Link the issue: Closes #123 -->

## How to test

<!-- Steps or commands a reviewer can run -->

## Checklist

- [ ] `pnpm lint && pnpm test:unit && pnpm test:e2e` pass locally
- [ ] Tests added/updated for new behaviour
- [ ] Works with no AI provider configured
- [ ] Migration committed if `schema.prisma` changed; `pnpm gen:schemas` run if task output schemas changed
- [ ] Docs and `CHANGELOG.md` (Unreleased) updated
- [ ] No secrets, real CVs or real interview data in code, fixtures or screenshots
