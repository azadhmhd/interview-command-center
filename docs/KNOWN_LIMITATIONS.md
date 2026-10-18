# Known limitations and future improvements

## Limitations (current release)
- **Unattended agents**: only Claude Code headless mode has an adapter (opt-in; local worker or Docker with a setup token). Cursor and Antigravity use
  manual handoff. The adapter is verified with a stub CLI and against `claude --help`; the test suite does not spend
  real subscription usage.
- **Antigravity skill format**: installed as a generic `AGENTS.md`; a native Antigravity rules/workflow format was not
  verified and is not generated.
- **No code execution** for coding practice: answers are evaluated by an LLM/agent or self-assessed. Adding execution
  requires an isolated sandbox container (never the API process).
- **Diagrams**: Markdown/Mermaid text and image attachments; Mermaid is not rendered in the UI.
- **Email**: password-reset links are emailed only when `SMTP_URL` is set; otherwise they are written to the API log.
  Invitations are links the owner sends manually. Reminders are in-app only (no email/push).
- **Search**: PostgreSQL full-text search (English config). No semantic/embedding search yet.
- **Cost**: token counts are recorded when the endpoint returns them; monetary cost estimates are not computed.
- **SSRF**: base URLs are DNS-checked at save and call time, but the resolved IP is not pinned for the connection
  (DNS rebinding window). Fine for personal deployments; pin IPs before offering a multi-tenant hosted service.
- **Streaming** responses and tool calling are not used (not needed for the current tasks).
- **Versions**: NestJS 11 (maintained "legacy" line), Prisma 6.19, TypeScript 5.9 were chosen for stable, known APIs.
  NestJS 12 / Prisma 7+ / TypeScript 7 upgrades are future work (Prisma 7 requires driver adapters and `prisma.config.ts`).
- **Tests reset**: e2e tests use a dedicated `icc_test` database and unique users per run; they do not wipe it
  (Prisma blocks AI-initiated `migrate reset`). CI starts from an empty database.
- **Docker image size**: the API image (~870 MB) ships full production `node_modules` incl. Prisma engines; it can be
  slimmed with a pruned deploy or distroless base.

## Future improvements
- Embeddings (pgvector) for semantic question retrieval and related-question suggestions.
- Email / web-push notifications respecting quiet hours.
- Calendar (ICS) import/export of interview rounds.
- Sandboxed code runner (separate container with resource limits) for coding exercises.
- Mermaid rendering and a lightweight whiteboard for system design notes.
- Per-task model profiles (generation / evaluation / coding) beyond the single evaluation override.
- Cursor / Antigravity adapters once a documented headless interface is available and verified.
