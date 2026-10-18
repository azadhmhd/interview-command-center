# Agent workspace

Open **this folder** in Claude Code, Cursor or another coding agent to run Interview Command Center tasks.

- `pnpm agent:install` (from the repo root) installs the skill pack here: `.claude/skills/` (Claude Code),
  `.cursor/rules/` (Cursor), `AGENTS.md` (generic agents), plus `schemas/` and `templates/`.
- The app writes task packages to `tasks/<taskId>/` when you click **Export task package**.
- Agents write their result to `tasks/<taskId>/output/result.json`; click **Sync output** in the app to import it.

Everything here except this README is generated or user data, and is git-ignored. See the main README → "AI setup".
