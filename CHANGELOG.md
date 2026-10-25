# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-25

### Added
- **Coding practice** ([docs](docs/CODING_PRACTICE.md)): 93 original coding interview problems in sixteen sections
  (Two Pointers to Matrices). Each section has a step-by-step animated visual (play, pause, step, speed), an overview
  lesson, Python/JavaScript templates, complexity and common mistakes. Problems run in a Python/JavaScript sandbox in
  your browser (Pyodide for Python); a run that passes every test marks the problem done, and the index and section
  tree show progress. An optional AI review (`code_review` task, LLM or Claude Code) scores correctness, approach,
  verification, code quality and communication with issues, edge cases, complexity and a clean solution.
- **Resume builder** ([docs](docs/RESUME_BUILDER.md)): unlimited resumes and job-specific copies with the same design,
  live A4 preview, autosave with conflict protection, PDF export and Publish (a new CV version attached to the
  application or job lead, so Auto Apply uploads it). Start from your profile, blank, or an AI word-for-word import of an
  uploaded CV.
  - "Classic Serif" theme that reproduces the reference CV's layout; heading icons are lifted from your own imported PDF.
  - AI tailoring per job that may only reword and reorder; added numbers are rejected in code; the master is never changed.
  - PDFs printed by headless Chromium in the API from the web app's `/print/resume` page.
- **MinIO / S3 storage** for CVs, generated resumes and attachments (`S3_ENDPOINT`), with automatic copy of existing local
  uploads on start; local disk stays the default when unset.
- **Auto Apply** section, kept separate from the application tracker:
  - Role-based discovery: Google Jobs (SerpApi) and Jooble search your titles × locations on schedule, with a site
    filter (LinkedIn, Indeed, Bayt, GulfTalent, Naukrigulf, company pages), best-apply-link choice, encrypted keys and a
    monthly search budget. Indeed links are recognised in alert emails.
  - Job discovery from official Greenhouse, Lever, Ashby, SmartRecruiters and Workable APIs, plus pasted job-alert emails and job URLs.
  - Normalisation, cross-source dedupe and explainable fit scoring with hard eligibility blockers.
  - CV selection, and apply kits built only from your profile and saved standing answers.
  - Approval queue with an optional auto-submit mode and guardrails: score threshold, daily cap, submit-intent
    duplicate protection, required confirmation evidence, CAPTCHA/login stops.
  - Local Playwright apply runner with isolated browser profiles, also as a headless Docker service for servers
    (`COMPOSE_PROFILES=runner`). Field keys beat fuzzy labels, searchable dropdowns are picked exactly, split
    first/last name forms are handled, a CV counts only once the uploader shows it, and headless it never clicks Submit
    on forms with invisible bot scoring (reported as Blocked).
  - Claude engine for the runner (`APPLY_RUNNER_ENGINE=claude`): Claude Code applies in your own Brave/Chrome through
    Claude in Chrome, which forms with invisible reCAPTCHA accept.
  - `icc-auto-apply` skill for Claude in Chrome.
  - ATS gate before applying: the job's CV gets an ATS keyword score; below 85 a CV tailored to the job (reworded and
    reordered only) is made from your builder resume, published and attached first, then the job is applied to.
  - Multi-select on Discover jobs with bulk Approve and Reject (skip).
  - A country in your locations covers its cities and other names ("UAE" includes Ajman, Sharjah, Ras Al Khaimah…).
  - Recruiter contacts with CSV export.
  - Explicit "Move to tracker".

### Fixed
- "Search now" on a slow search showed `Unexpected token 'I'… is not valid JSON`: scans now answer within the web
  proxy's timeout and finish in the background, and the web client reports non-JSON errors readably.
- Apply runner: waits for client-rendered forms (Ashby has no `<form>` element), and fill-only mode no longer crashes on
  real pages.
- Uploaded CVs and attachments are stored relative to the upload folder, so files saved under local dev still open in
  Docker (the apply runner got a 404 for the CV). `apps/api/data` is no longer copied into Docker images.
- Matching: seniority words alone no longer make a title "close" (e.g. "Senior Legal Counsel" vs "Senior Backend Engineer");
  off-target titles stay off the shortlist, titles in languages you don't use score low, and a single listed
  technology no longer counts as a full skills match.

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
  With the headless adapter on, a task the LLM gives up on (or one you retry while it waits for an agent) runs with
  Claude Code automatically before it falls back to manual.
- Multi-user workspaces, invitations, roles, explicit record sharing, audit log, data export and account deletion.
- Docker Compose deployment from a single Dockerfile, CI, unit / API e2e / Playwright tests and full documentation.
