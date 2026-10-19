# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Auto Apply** section, kept separate from the application tracker:
  - Role-based discovery: Google Jobs (SerpApi) and Jooble search your titles × locations on schedule, with a site
    filter (LinkedIn, Indeed, Bayt, GulfTalent, Naukrigulf, company pages), best-apply-link choice, encrypted keys and a
    monthly search budget. Indeed links are recognised in alert emails.
  - Job discovery from official Greenhouse, Lever, Ashby, SmartRecruiters and Workable APIs, plus pasted job-alert emails and job URLs.
  - Normalisation, cross-source dedupe and explainable fit scoring with hard eligibility blockers.
  - CV selection, and apply kits built only from your profile and saved standing answers.
  - Approval queue with an optional auto-submit mode and guardrails: score threshold, daily cap, submit-intent
    duplicate protection, required confirmation evidence, CAPTCHA/login stops.
  - Local Playwright apply runner with isolated browser profiles.
  - `icc-auto-apply` skill for Claude in Chrome.
  - Recruiter contacts with CSV export.
  - Explicit "Move to tracker".

## [0.1.0] - 2026-10-18

### Added
- Job application tracker with table, Kanban and timeline views, custom statuses, duplicate detection, contacts,
  attachments, activity history and follow-up reminders.
- Per-company interview round sequences and an interview journal with immutable original answers, improved and
  approved answers, missed concepts, mistakes, code snippets and notes import.
- Personal knowledge base with PostgreSQL full-text search, canonical questions across companies and an SM-2
  spaced-repetition revision queue.
- Round-specific preparation courses: deterministic offline plans (job description, round type, deadline, weaknesses)
  enriched by AI when available; lessons, practice, mock interviews, rubric evaluation and readiness tracking.
- Provider-agnostic OpenAI-compatible LLM client with connection testing, encrypted keys, SSRF protection and usage records.
- Persistent task queue (PostgreSQL + BullMQ) with routing, retries, leases, crash recovery and a deterministic scheduler.
- Coding-agent integration: manual task packages for Claude Code / Cursor / Antigravity, an opt-in Claude Code headless
  adapter, and a reusable agent skill pack with JSON Schemas.
- Multi-user workspaces, invitations, roles, explicit record sharing, audit log, data export and account deletion.
- Docker Compose deployment from a single Dockerfile, CI, unit / API e2e / Playwright tests and full documentation.
