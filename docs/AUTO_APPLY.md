# Auto Apply

A separate section that finds jobs, scores them with explanations, prepares an apply kit and applies, either with
you in the loop or fully automatically within hard guardrails. It does **not** create records in the application
tracker; a job reaches the tracker only when you click **Move to tracker**.

```
sources ──▶ normalise + dedupe ──▶ score + blockers ──▶ shortlist ──▶ apply kit ──▶ approve (you, or auto)
                                                                                     │
                       evidence ◀── apply runner / Claude in Chrome / you ◀──────────┘
```

## Data model (new tables only)

| Table | Holds |
|---|---|
| `JobSource` | Search providers (encrypted API key, monthly budget, interval) and company boards you watch (board slug); last run / success / error, scan lease |
| `JobLead` | One discovered job: normalised fields, `dedupeKey`, status, fit score + breakdown + explanation, blockers, selected CV, apply kit, discovery history |
| `ApplyAttempt` | Every apply run: method (auto / prefill / agent / manual), status, evidence (confirmation text, URL, screenshot), missing fields |
| `RecruiterContact` | Recruiters saved for later outreach (from job posts, alert emails, pasted text, manual) |
| `AutoApplyConfig` | Preferences, standing answers, auto-submit guardrails, scan interval |

Migrations: `apps/api/prisma/migrations/20261019090000_auto_apply` and `20261020090000_search_providers` (adds two enum values). It adds tables, enums and relations only; existing
tables are unchanged. Reused from the app: auth & workspaces, the CV library, the LLM client, the task queue, the
SSRF-safe page fetcher and the tracker's `company|title` dedupe key (so internal history is cross-checked).

## Finding jobs by role

You don't need to name companies or paste URLs. Search providers run **your target titles × your search locations**
(Settings → Where to search) and everything they return goes through the same dedupe → score → kit → queue pipeline,
on schedule, with no clicks.

| Provider | What it covers | Cost | Verified |
|---|---|---|---|
| Google Jobs via [SerpApi](https://serpapi.com/google-jobs-api) | Google's job index: LinkedIn, Indeed, Bayt, GulfTalent, Naukrigulf, Glassdoor and company career pages. `gl` country code (default `ae`). | Free plan: 250 searches/month | ⚠️ against SerpApi's documented response in tests; not yet run with a real key |
| [Jooble](https://jooble.org/api/about) | Jooble's own aggregated index | Free key on request | ⚠️ request/response shape taken from Jooble's client examples; unverified until you add a key |

- **Queries:** one per title per search location (titles from settings plus your profile's target roles), capped by
  *Max searches per run* (default 6).
- **Budget:** each provider counts searches per calendar month and stops at its budget (SerpApi default 250, Jooble 500).
  A search counts before it is sent, because providers bill failed searches too. A rejected key stops the run immediately.
- **Schedule:** each provider runs every `everyHours` (default 24). 6 searches a day stays within SerpApi's free 250.
- **Sites:** you choose which sites you are willing to apply through (LinkedIn, Indeed, Bayt, GulfTalent, Naukrigulf,
  company career pages, other boards). Per job, the best allowed link wins: a form the runner supports
  (Greenhouse/Lever/Ashby) → the company careers page → the big boards → other aggregators. Jobs with no allowed link
  are dropped. When the same job turns up again with a better link (e.g. its Greenhouse page after LinkedIn), the lead
  switches to it.
- **Keys** are encrypted with `APP_ENCRYPTION_KEY` (AES-256-GCM) and never returned by the API; the UI shows the last 4 characters.
- **LinkedIn and Indeed** have no public job-search API (Indeed's Publisher API is closed to new users) and forbid
  crawling. Their listings arrive through Google Jobs, or paste their alert emails (`linkedin.com/jobs/view/…`,
  `indeed.com/viewjob?jk=…` and `rc/clk?jk=…` links are recognised).

## Watched company boards and other sources

| Source | Access | Verified |
|---|---|---|
| Greenhouse | Official public Job Board API (+ application questions) | ✅ live 2026-10-18 (GitLab: 232 jobs, Careem: 14) |
| Lever | Official public Postings API | ✅ live API check (Palantir: 310 jobs) |
| Ashby | Official public Posting API (incl. compensation) | ✅ live 2026-10-18 (OpenAI: 813, Ziina: 13) |
| SmartRecruiters | Official public Posting API | ✅ live API check (Bosch: 5,079 listed) |
| Workable | Public widget API | ⚠️ endpoint verified; no account with open roles tested |
| Job-alert emails (LinkedIn, Bayt, GulfTalent, Naukrigulf, ATS links) | You paste the email; parsed locally | ✅ unit-tested with HTML and text alert formats; not tested against your real inbox |
| Any job URL | Existing SSRF-safe importer (schema.org JobPosting, then meta tags) | ✅ for pages with structured data; many boards block automated reads |
| LinkedIn / Bayt / GulfTalent / Naukrigulf search | **Not crawled** | LinkedIn's robots.txt disallows all crawling and its terms forbid bots/automated applying; Bayt and GulfTalent block automation and need logins; Naukrigulf did not respond. Use their alert emails or pasted links. |

Each scan takes a lease on its source, so scans never overlap. Failures are recorded on the source (`lastError`) without
affecting other sources. The worker scans company boards every `discoveryHours` (default 12) and search providers on
their own interval.

## Matching (explainable, deterministic)

Weighted 0–100: skills 35 · title 20 · seniority 15 · location 15 · recency 10 · salary 5. Every dimension stores a
reason. Hard **blockers** make a job ineligible whatever its score:

- excluded keywords
- security clearance, or citizens/nationals only
- a required language you don't list
- asks for more than 2 years above your experience
- outside your locations, or remote only within other countries
- pay below 80 % of your minimum (same currency only)

Technology names that are also English words (Go, REST, Spark, RAG) need technical context to count. A shortlisted job
can get an optional LLM "fit review" (`job_match` task). It is shown next to the score but never overrides blockers.
The CV is chosen from your existing CVs by coverage of the job's technologies; no CV is ever generated.

## Apply kit and standing answers

Questions come from the job board (Greenhouse publishes them) or a per-ATS standard field set. Answers come only from
your profile and **standing answers** (Auto Apply settings):

- **Factual** questions (salary, notice, work authorisation, sponsorship, relocation…) need a standing answer.
  Otherwise they're left blank and flagged.
- **Sensitive** questions (consents, declarations, demographics) are answered only by explicit decisions you save:
  "always decline demographic questions", "consent to privacy notices", "agree to accuracy declarations".
  All are off by default.
- **Open-ended** questions can get an AI draft grounded in your profile (`apply_answers` task), if allowed.
- Your own edits always win, and a kit is **complete** only when every required answer is verified.

## Statuses

`DISCOVERED → EVALUATED / SHORTLISTED → READY_FOR_REVIEW → APPROVED → APPLYING → SUBMITTED → INTERVIEW / REJECTED / WITHDRAWN`,
plus `NEEDS_ATTENTION` and `SKIPPED`. Transitions are enforced in `src/autoapply/state.ts`. `SUBMITTED` requires evidence.

## Auto-submit (opt-in, no stop) and its guardrails

With **Auto-submit** on, a job is approved and submitted without asking you only if:

- its score is at or above your auto-apply threshold;
- it has no blockers;
- its kit is complete;
- its form is supported (Greenhouse / Lever / Ashby);
- it hasn't been applied to before, here or in your tracker;
- you're under the daily cap.

These rules always apply, in every mode:

- **CAPTCHA, login, OTP or human-verification** → the job stops as `BLOCKED` / Needs attention. Nothing is bypassed.
- **Required question without a verified answer** (including questions the kit didn't know about) → not submitted.
- **Submit-intent:** the server records `SUBMIT_CLICKED` *before* the runner clicks Submit. Any attempt that clicked
  Submit blocks every future attempt until you either mark it submitted or confirm "it was not submitted" (audited).
  A crash after Submit is never retried automatically.
- **Evidence:** a submission counts only with a confirmation the runner saw after submitting, either new confirmation
  text or a confirmation URL. A "thank you for your interest" line already on the job page doesn't count.

## The apply runner (your machine)

`apps/apply-runner`: Playwright in a dedicated, isolated browser profile (`~/.icc-apply-runner/profiles/<name>`,
never your everyday Chrome). A lock file prevents concurrent use, and cookies/passwords are never read or logged.

```bash
pnpm install && npx playwright install chromium
# Auto Apply → Settings → Runner tokens → Create
ICC_API_URL=http://localhost:3000 ICC_RUNNER_TOKEN=<token> pnpm apply:runner
```

Options: `APPLY_RUNNER_PROFILE` (default `jobs`), `APPLY_RUNNER_HEADLESS=true` (default visible), `APPLY_RUNNER_ONCE=true`,
`APPLY_RUNNER_POLL_MS`. With auto-submit off it fills the form and waits up to 20 minutes for **you** to click Submit
(your click is recorded first), then captures the confirmation.

## Claude Code path (optional operator)

**Apply with Claude Code** on a job creates a `job_application` task. It always goes to a manual agent session (it needs
a real browser, never the headless CLI or the LLM). Export the package, run Claude Code with the **Claude in Chrome**
extension in `agent-workspace`, and the `icc-auto-apply` skill fills the form, uploads the packaged CV and reports
evidence. Imports are validated the same way: no confirmation, no `SUBMITTED`.

## Recruiters

Emails found in job descriptions are saved automatically and linked to the job. You can also add contacts by hand,
paste a recruiter email or signature to extract them, mark them contacted, and **export CSV** for outreach later.
Nothing is ever emailed from the app.

## Testing

- Unit (`src/autoapply/autoapply.spec.ts`, 25 tests): Google Jobs and Jooble normalisation, site filter and
  best-link choice, salary/date parsing, query building, Indeed links, normalisation for all five boards, alert parsing, URL
  canonicalisation, dedupe, scoring, blockers, false technology matches, CV selection, kit rules, transitions, evidence.
- API e2e (`test/autoapply.e2e-spec.ts`, 10 tests, fake board + SerpApi server):
  - role search: key encrypted and never returned, site filter, company page preferred, monthly budget
  - discovery, dedupe and source failures
  - scan overlap
  - approval enforcement and single claim
  - evidence verification and duplicate prevention
  - crash recovery
  - auto mode and the daily cap
  - alert import, manual submission, tracker hand-off, recruiters, CSV
  - Claude-skill routing and validation
  - user isolation and runner tokens
- Runner (`apps/apply-runner/tests`, 8 Playwright tests against local mock ATS pages):
  - intent before submit, evidence capture
  - refused intent, CAPTCHA and login stops
  - unknown required question, missing CV
  - the "thank you for your interest" false positive
  - user-submitted prefill
  - profile isolation and locking

No test ever contacts a real job site or submits a real application.

## Limitations

- **Real form submission is unverified.** The runner's form handling is verified on mock Greenhouse-style pages
  only, because verifying it on real sites means sending real applications. Expect real forms to differ: custom
  widgets, multi-step Workday-style flows, reCAPTCHA on submit. Those end up in Needs attention rather than being guessed.
- **LinkedIn Easy Apply and other board logins are not automated.**
- **No inbox access.** Alert emails are pasted, and recruiter replies are not detected automatically.
- **Search providers** have not been run with real keys yet; SerpApi's coverage depends on what Google indexes for
  your country, and Jooble returns short snippets (the full description is read when you open or fetch the job).
- **Workable** adapter: endpoint verified, listings mapping untested against a live account with open roles.
- **Cover notes and open-ended answers** are template- or AI-drafted from your profile; tailored CV generation is
  deliberately not done.
