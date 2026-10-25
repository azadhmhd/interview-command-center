# Coding-agent tasks and the skill pack

AI work is a persistent **task** (`AgentTask`) that can run in one of three ways:

| Method | When | Verified |
|---|---|---|
| `llm` | Configured OpenAI-compatible endpoint available | yes (e2e with a fake OpenAI-compatible server) |
| `agent_manual` | Always available. You run the task in Claude Code / Cursor / Antigravity using your subscription, then sync the output | yes (e2e: package → output file → validated import) |
| `agent_cli` | Opt-in: Claude Code's documented headless mode (`claude -p`), run by the worker (locally with your login, or in Docker with `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`) | yes: stub CLI in e2e (incl. secret-leak check) and real runs in the Docker worker (course generation, CV extraction). The automated suite never spends real usage |

Cursor and Antigravity have **no unattended adapter**: no documented, verified integration was available, so they use
manual handoff. Subscription logins are never converted into API keys and no private endpoints are used.

## Task states

`scheduled → queued → running → completed`, with `retry_wait` (backoff), `failed`, `ready_for_agent → submitted →
awaiting_review → completed`, and `cancelled`. By default results are applied and the task completes automatically;
turn on **Workspace & members → "Ask me to approve AI and agent results"** to stop them in `awaiting_review` first.
A task is only completed after its output has been validated and persisted.

## Manual handoff (guaranteed path)

1. Install the skill pack once: `node skills/install.mjs` (writes into `agent-workspace/`).
2. In the app open the task (Agent task queue → task) and click **Export task package**. This writes
   `agent-workspace/tasks/<taskId>/` with `TASK.md`, `task.json` (context + instructions), `output-schema.json`.
3. Open the `agent-workspace` folder in your agent:
   - **Claude Code**: `cd agent-workspace && claude`, then: *"Use the icc-prepare-interview skill for tasks/<taskId>"*
     (the skill name is in `task.json` → `skill`). Skills live in `.claude/skills/`.
   - **Cursor**: open the folder; rules in `.cursor/rules/icc-*.mdc` are agent-requested. Ask: *"Run the ICC task in tasks/<taskId>"*.
   - **Antigravity / others**: open the folder; `AGENTS.md` describes the workflow and lists the skills.
4. The agent writes `tasks/<taskId>/output/result.json`.
5. Click **Sync output** (or upload / paste the JSON). Invalid output is rejected with the exact schema issues and
   nothing is imported. Valid output is applied idempotently and the task completes (or waits in `awaiting_review`
   if you enabled approvals).
6. Want something different? Use **Regenerate lesson**, **Generate a fresh course**, **Propose improved answer** or
   **Retry** in the app; every redo is idempotent.

Agents only see the task folder: no database, no `.env`, no credentials. Package contents are the user's own context
for that task and are treated as untrusted data by the skills.

## Unattended Claude Code (optional)

Local: `AGENT_CLAUDE_CLI_ENABLED=true` in `.env`, restart API + worker. Docker: also set `CLAUDE_CODE_OAUTH_TOKEN`
(from `claude setup-token`); the image ships the CLI and only the worker gets the token. Full steps: README → AI setup.

The worker runs
`claude -p "<use skill X on tasks/<id>>" --output-format json --permission-mode acceptEdits --tools Read,Write,Glob,Grep --allowedTools … --no-session-persistence --strict-mcp-config`
with `cwd = agent-workspace`, a minimal environment (`PATH`, `HOME`, `LANG`, plus `CLAUDE_CODE_OAUTH_TOKEN` when set; no app secrets), web tools only
for research tasks, and a timeout (`AGENT_CLAUDE_CLI_TIMEOUT_MS`). The resulting file is validated exactly like a
manual import. This uses your Claude subscription's usage; enable it only if you accept that.

## Skill pack

Source in `skills/`; installed copies in `agent-workspace/`.

| Skill | Task types |
|---|---|
| `icc-prepare-interview` | course_generation, lesson_regeneration |
| `icc-research-patterns` | company_research |
| `icc-model-answers` | answer_improvement, mock_generation |
| `icc-evaluate-answer` | answer_evaluation, gap_analysis |
| `icc-coding-practice` / `icc-system-design-practice` / `icc-behavioral-prep` | round-specific guidance used by the above |
| `icc-final-revision` | revision_notes |
| `icc-import-validate` | resume_extraction, resume_draft_import, question_extraction, output self-check |
| `icc-tailor-resume` | resume_tailoring |

Output JSON Schemas (`skills/schemas/*.schema.json`) are generated from the API's Zod contracts:
`pnpm --filter api gen:schemas`. Templates for courses, readiness reports and STAR stories are in `skills/templates/`.
