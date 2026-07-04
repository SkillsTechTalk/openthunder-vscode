# Changelog

## 0.1.1

- Clearer Marketplace listing and honest, accurate privacy language.
- Inline completions are now experimental and OFF by default.
- The extension is now source-available under PolyForm Shield 1.0.0: [github.com/SkillsTechTalk/openthunder-vscode](https://github.com/SkillsTechTalk/openthunder-vscode).

## 0.1.0

Initial release: local-first repo intelligence inside VS Code.

- Copy AI Context Packs: paste-ready repo context for Claude Code, Cursor, Copilot, and Codex.
- Review Current Diff: offline review of uncommitted changes via the OpenThunder CLI.
- Generate PR Summary: PR-ready summary, opened in an editor and copied to the clipboard.
- Run Health Check: change verification and codebase health with grades, top risks, and recommended cleanup missions.
- Create Mission from Selection: turn selected code into a verified OpenThunder mission.
- Open Repo in OpenThunder Desktop, plus quick access to the dashboard.
- One-click MCP install: wire the OpenThunder MCP server (Repo Knowledge Graph tools such as impact analysis and change planning) into Claude Code, Cursor, or Codex from the command palette.
- Health Check, Missions, and Chat sidebar views.
- Inline completions are experimental and OFF by default (repo understanding and change verification are the focus, not completion).

Local-first: repository analysis runs against your local OpenThunder engine, and no account is required for local use. Data goes to an external AI provider only when you configure one and run an AI action. Before sending code to a provider, OpenThunder withholds secret files (.env, keys, credentials) and redacts secret-shaped values on a best-effort basis.
