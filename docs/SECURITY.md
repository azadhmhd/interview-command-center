# Security and privacy

## Authentication and sessions
- Passwords: `scrypt` (Node stdlib), 16-byte salt, constant-time compare. Minimum 10 characters.
- Sessions: random 256-bit tokens; only their SHA-256 is stored. Delivered as an `httpOnly`, `SameSite=Lax` cookie
  (`Secure` with `COOKIE_SECURE=true`). The browser talks to the API same-origin, so no token is exposed to JS.
  `Authorization: Bearer` is accepted for API clients and tests.
- Password reset: single-use, 1-hour token (hashed at rest); a reset revokes every session. The response never
  reveals whether an account exists.
- Rate limits: 600 requests/min per IP globally; 20/min on auth endpoints (`THROTTLE_AUTH_LIMIT`).

## Authorization (enforced on the server for every request)
- A global guard resolves session → user → workspace membership → role on every request. Every query is scoped by
  `workspaceId`. Records outside the caller's workspace return **404** (not 403) so IDs cannot be probed.
- Roles: `OWNER` (settings, members, LLM config), `EDITOR` (write), `VIEWER` (read). Non-GET requests need EDITOR by default.
- Personal workspaces are private and cannot take members. Team workspaces use invitations bound to an email address.
- Record sharing (`RecordShare`) grants one user VIEW or EDIT on one application or course. Shared courses expose only
  the course and lessons, never the source application, rounds, answers, CV or context snapshot. Revocation is checked
  on every read.
- Verified by `apps/api/test/security.e2e-spec.ts` with two independent users and direct API calls (22 cross-user
  read/write attempts, workspace-header spoofing, share upgrade/downgrade/revocation).

## Secrets
- LLM API keys stored in the DB are AES-256-GCM encrypted with `APP_ENCRYPTION_KEY`; the API returns only the last 4
  characters. Environment keys never leave the server.
- Secrets are never logged, never put in task packages (tested), exports exclude password hashes, keys and storage paths.
- The Claude Code adapter runs with a minimal environment (no `DATABASE_URL`, keys or Redis URL — tested with a stub).

## Untrusted content
- CVs, job descriptions, notes, public research and agent output are data. LLM prompts wrap them in `<context>` with
  an explicit instruction to ignore embedded instructions; skills repeat the rule.
- Agent outputs are validated against Zod schemas before anything is written; invalid output imports nothing.
- Task folder paths are derived from validated task IDs and checked against traversal; output files are size-limited.
- Uploads: PDF (magic-byte checked), plain text or Markdown for CVs; PDF/text/PNG/JPEG/WEBP attachments; 10 MB limit;
  stored with random names outside the web root, served with `Content-Disposition: attachment` and `nosniff`.
- Markdown is rendered with `react-markdown` with raw HTML disabled.
- Candidate code is never executed.

## Network
- SSRF guard on LLM base URLs (protocol, no embedded credentials, DNS resolution, metadata ranges always blocked,
  private ranges blocked when `LLM_ALLOW_PRIVATE_NETWORK=false`). Known gap: no IP pinning between check and connect.
- Compose publishes only the web port (bound to 127.0.0.1); put TLS in front.
- Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Cache-Control: no-store` on API responses.

## Privacy controls
- Explicit consent before sending interview data to non-local LLM endpoints.
- Only task-relevant context is sent to models.
- Data export (`/api/account/export`) and permanent account deletion (password + typed confirmation) remove all owned
  workspaces, records and uploaded files.
- Audit trail for sensitive actions.
