# OpenThunder for VS Code

**Understand the repo. Review AI changes. Know when it's safe to ship.**

Your coding agent can write the change. OpenThunder helps you understand your repository,
review what changed, and verify it before you commit, without leaving VS Code.

OpenThunder is the repo-aware understanding and change-verification layer. It cooperates with
Claude Code, GitHub Copilot, Cursor, and Codex rather than replacing them.

- **Give your agent better context.** Copy a repo-aware AI Context Pack for Claude Code, Cursor,
  Copilot, or Codex, or install the OpenThunder MCP server so agents can query your repo.
- **Understand any repository.** Explain the architecture and run a health check (grade, top risks,
  study path) on the current workspace.
- **Review changes before you ship.** Review your current diff and generate a PR-ready summary.
- **Turn work into verified missions.** Send a selection to OpenThunder as a tracked build/review mission.

**Local-first. No account required for local use.**

## Commands

| Command | What it does |
|---|---|
| `OpenThunder: Explain This Repo` | Open the architecture view for the current repo |
| `OpenThunder: Run Health Check` | Grade the workspace (A–F) with the top risks |
| `OpenThunder: Copy Health Summary` | Copy a shareable summary of the latest report |
| `OpenThunder: Copy AI Context Pack` | Paste-ready repo context for Claude Code, Cursor, Copilot, Codex |
| `OpenThunder: Review Current Diff` | Review your uncommitted changes |
| `OpenThunder: Generate PR Summary` | A PR-ready summary, opened and copied |
| `OpenThunder: Create Mission from Selection` | Turn selected code into a tracked mission |
| `OpenThunder: Install MCP Server` | Install the OpenThunder MCP server for your agent |
| `OpenThunder: Set up Claude Code` | Wire Claude Code to work with this repo |
| `OpenThunder: Open Dashboard` / `Open in Desktop` | Open the full OpenThunder workbench |

The sidebar adds **Health Check**, **Missions**, and **Chat** panels.

## Requirements

Most commands talk to a local OpenThunder engine at `http://localhost:7700`. Offline commands
(context pack, diff review, PR summary) use the OpenThunder CLI instead.

- **Recommended:** install the desktop app from [openthunder.dev](https://openthunder.dev) — the
  local engine starts automatically. No account needed for local use.
- If the engine isn't running, the status bar shows **OpenThunder: Run Locally** with options to
  start it, use the CLI, or open the browser app.

## Privacy

- **Local-first.** Repository analysis (Explain, Health Check, diff review) runs against your local
  OpenThunder engine on `localhost`. It does not upload your source by default, and no account is
  required for local use.
- **You choose if anything leaves.** Data goes to an external AI provider only when *you* configure
  one and run an AI action; then the prompts and context OpenThunder sends are processed by that
  provider under its terms.
- **Secret protection (best-effort).** Before sending code to an AI provider, OpenThunder withholds
  secret files (`.env`, `secrets.*`, keys, credentials) and redacts secret-shaped values. This
  reduces risk but is not a guarantee — review what you send for sensitive workflows.
- Analysis is read-only; OpenThunder does not modify your code without an explicit action.

See the full [privacy policy](https://openthunder.dev/docs/privacy.html).

## Settings

| Setting | Default | Description |
|---|---|---|
| `openthunder.serverUrl` | `http://localhost:7700` | Local OpenThunder engine URL |
| `openthunder.cloudUrl` | `https://openthunder.ai` | Browser app used as a fallback |
| `openthunder.cliPath` | `openthunder` | Path to the OpenThunder CLI (offline commands) |
| `openthunder.completionsEnabled` | `false` | Experimental inline completions (off by default) |
| `openthunder.provider` | `mock` | Provider for completions if enabled |

## Links

- [openthunder.dev](https://openthunder.dev) — download & docs
- [openthunder.ai](https://openthunder.ai) — cloud app
