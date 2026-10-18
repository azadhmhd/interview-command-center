# Engineering progress checklist

Legend: [x] implemented **and** verified by an executed test or manual run · [~] implemented, partially verified (note says how) · [ ] not done

Last full verification: 2026-10-18 — typecheck ✓ · unit 22/22 ✓ · API e2e 21/21 ✓ · UI e2e 1/1 ✓ (dev stack and production Docker stack) · API + web production builds ✓ · Docker Compose stack healthy ✓ · backup/restore ✓.

## Phases
- [x] Phase 1: repo inspection (empty repo, greenfield), architecture doc, auth + private workspaces, schema + migrations, Docker
- [x] Phase 2: applications, custom round sequences, journal, FTS search, activity history, dashboard, reminders
- [x] Phase 3: OpenAI-compatible client, AI config page, course generator (deterministic + AI), evaluation, knowledge base, revision queue
- [x] Phase 4: persistent task queue, scheduler, manual handoff, skill pack, validated import
- [~] Phase 5: Claude Code headless adapter (verified with a stub CLI; real-subscription run not executed), routing/fallback ✓, mock interviews ✓. No Cursor/Antigravity unattended adapters (no verified interface)
- [x] Phase 6: security hardening, two-user sharing tests, backup/restore verification, deployment docs

## Acceptance criteria (spec §21)
| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Register + create application | [x] | `acceptance #1` (incl. duplicate detection), UI e2e |
| 2 | Upload + version resume | [x] | `acceptance #2` (v1/v2, type/magic checks, no storage paths leaked) |
| 3 | Custom round sequence | [x] | `acceptance #3` (create, reorder, unknown type rejected, milestones planned) |
| 4 | Record questions, answers, mistakes | [x] | `acceptance #4` (quick capture, notes import idempotent, public-report label), UI e2e |
| 5 | Prep plan for a specific round | [x] | `acceptance #5`, UI e2e |
| 6 | Plan reflects JD, round type, deadline, weaknesses | [x] | `acceptance #5` asserts JD (kafka), weak topics, 3 study days, past questions first; `planner.spec` |
| 7 | Complete lessons + practice attempts | [x] | `acceptance #7`, UI e2e |
| 8 | Evaluation + retry | [x] | `acceptance #7` (self-eval, retry, compare with previous), `#13` (AI evaluation via eval model), `agents.e2e` (CLI evaluation) |
| 9 | Original answers preserved | [x] | `acceptance #9` (409 on change), `#13` (AI improvement leaves original intact) |
| 10 | Search + reuse past questions | [x] | `acceptance #10` (FTS, cross-company canonical linking, revision review) |
| 11 | Scheduler creates + recovers tasks after restart | [x] | `acceptance #11` (short notice, reschedule, crashed lease recovered by a freshly booted app, no duplicates on 2nd tick); `milestones.spec` |
| 12 | Manual handoff package valid | [x] | `acceptance #12` (package contents, files on disk, invalid output rejected, double import no-op, review → approve) |
| 13 | Configurable OpenAI-compatible endpoint | [x] | `acceptance #13` against an OpenAI-compatible fake; key encrypted at rest, never returned |
| 14 | Clear errors for bad endpoint/credentials | [x] | `acceptance #14` (401, 404, ECONNREFUSED, metadata IP, bad scheme); `url-guard.spec` |
| 15 | Works with LLM_ENABLED=false | [x] | `acceptance #5/#7` run with no LLM; UI e2e runs with no LLM |
| 16 | Unsupported agent falls back | [x] | `acceptance #16` (manual handoff, clear retry error, validated import) |
| 17 | Retry without duplicates | [x] | `acceptance #17` (500 → backoff, invalid JSON → repair/retry, exhaustion → agent fallback, manual retry, unique lesson keys, lease skip) |
| 18 | Second user cannot access first user's data | [x] | `security #18` (10 reads, 12 writes, workspace-header spoofing, unauthenticated) |
| 19 | Sharing respects permission + revocation | [x] | `security #19` (VIEW/EDIT, revoke, course share hides source records, audit) |
| 20 | Production build succeeds | [x] | `tsc` API build, `next build` (29 routes), `docker compose build` + healthy stack + UI e2e against it |

## Other verified items
- [x] Password reset, logout, session revocation, account deletion, data export (security e2e)
- [x] Team workspaces: invitations bound to email, viewer is read-only, member removal (security e2e)
- [x] Claude Code adapter runs with no app secrets in its environment (agents e2e with stub)
- [x] Backup → restore into a scratch database: identical row counts for users, applications, questions, lessons and tasks; FTS column regenerated (manual run, 2026-10-18)
- [x] OpenAPI docs: 89 paths, request bodies generated from Zod (`/api/docs-json`)
- [x] Manual UI walkthrough in the browser: onboarding, application, round, notes import, journal editing, prepare, lesson practice + self-evaluation, task queue

## Bugs found during verification and fixed
- New-application form mounted before settings loaded (blank status, missing salary default) → render after data is ready
- Form labels not programmatically associated → `Field` wraps controls in `<label>`
- Milestone course task and manual "Prepare" produced duplicate AI tasks → manual prepare supersedes; redundant milestone tasks skip
- Task creation tried `queued → queued` → tasks are created `scheduled` and routed
- Practice model answer lookup preferred the canonical entry over the lesson → lesson/session first
- `nest start --watch` produced an empty dist with incremental builds → incremental off for builds

## Auto Apply (added 2026-10-19)

| Item | Status | Evidence |
|---|---|---|
| Separate data model (5 new tables, tracker untouched) | [x] | migration `20261019090000_auto_apply`; e2e asserts no tracker rows are created |
| Greenhouse / Lever / Ashby / SmartRecruiters adapters | [x] | unit fixtures + live runs: GitLab 232, OpenAI 813, Ziina 13, Careem 14 jobs normalised and scored |
| Workable adapter | [~] | endpoint verified live; no account with open roles tested |
| Alert-email + URL import | [x] | unit (LinkedIn HTML, Bayt text) + e2e |
| Explainable scoring + blockers | [x] | unit tests; live data calibration fixed restricted-remote and false technology matches |
| Approval, auto-submit guardrails, duplicate prevention, evidence | [x] | e2e: single claim, submit-intent, unverified → needs attention, verified-not-submitted unlock (audited), daily cap |
| Crash recovery (never retried after Submit) | [x] | e2e via worker tick |
| Apply runner (isolated profiles) | [x] / [~] | 8 Playwright tests on local mock forms; **not exercised on real job sites** (would submit real applications) |
| Claude Code `icc-auto-apply` skill path | [x] / [~] | routing forced to manual browser session + evidence validation (e2e); real Claude in Chrome run not executed |
| Recruiter contacts + CSV | [x] | e2e |
| User isolation | [x] | e2e: second user gets 404 / empty everywhere |
