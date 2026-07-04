# Changelog

## 0.1.7

- Auto-discovers the running engine: reads the port OpenThunder actually bound (from .openthunder/dev-ports.json) instead of always assuming 7700, so a stray old server can no longer hijack the connection.

## 0.1.6

- **Start OpenThunder from the editor:** when the local engine isn't running, the Current Change panel now has a **Start OpenThunder** button (and an "OpenThunder: Start Local Engine" command) that launches the desktop app for you, then the panels fill in. No more sitting idle when the app is closed.

## 0.1.5

- HTTPS (the cloud app and sign-in) now opens in your browser; the local OpenThunder dashboard opens as an embedded VS Code tab (OAuth works, and OT stays in the editor).
- New command **OpenThunder: Open a View in the Editor** — open Architecture, Security, Repositories, Mastery, Reports, Trust, or Missions as an in-editor tab, so the plugin does much more than Missions and Chat.

## 0.1.4

- The embedded dashboard now works with the packaged desktop app too: the extension asks the local engine where the dashboard is served instead of guessing the port.
- Sign-in (including Skills Tech Talk) now tries to open inside VS Code (a new editor tab) so both OpenThunder and Skills Tech Talk can run in the IDE. If a login provider blocks embedding, it opens in your browser for that step.

## 0.1.3

- New **Current Change** panel: a live "Can I Ship?" verdict for your working changes (ship / caution / hold, risk, changed files, blast radius, blockers and cautions), relayed from your local OpenThunder engine, right in the sidebar.
- **Stay in the editor:** the OpenThunder dashboard now opens *inside* VS Code (embedded, beside your code) when running locally, so you never have to leave for a browser.
- New command **OpenThunder: Trust & Data Activity** — see the current mode (Local Only / Standard) and how many requests left your machine, without leaving the editor.
- The extension stays a thin visual layer: analysis runs on your local engine, VS Code just shows it.

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
