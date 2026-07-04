import * as vscode from 'vscode';
import { runCli, showCliNotFound } from './cli';
import { registerCompletionProvider } from './completionProvider';
import { MissionsViewProvider } from './missionsView';
import { ChatViewProvider } from './chatView';
import { HealthViewProvider } from './healthView';
import { CurrentChangeViewProvider } from './currentChangeView';

let statusBar: vscode.StatusBarItem;
let connBar: vscode.StatusBarItem;
// Whether the local OpenThunder server answered its health probe. Drives the
// "prefer local, offer browser" routing and the connection status bar.
let localReachable = false;

// Where users download OpenThunder to run it locally.
const DOWNLOAD_URL = 'https://openthunder.dev';

export function activate(context: vscode.ExtensionContext) {
  const config    = () => vscode.workspace.getConfiguration('openthunder');
  const serverUrl = () => config().get<string>('serverUrl', 'http://localhost:7700');
  const cloudUrl  = () => config().get<string>('cloudUrl', 'https://openthunder.ai');
  const provider  = () => config().get<string>('provider', 'mock');

  // Status bar item
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'openthunder.toggleCompletions';
  updateStatusBar(config().get<boolean>('completionsEnabled', false));
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Connection status bar: an always-visible affordance for running OpenThunder
  // locally. Reflects whether the local server is reachable and, when it is not,
  // nudges the user to download it (run locally, so the plugin connects directly)
  // or use the browser app instead.
  connBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  connBar.command = 'openthunder.connect';
  connBar.show();
  context.subscriptions.push(connBar);

  // Inline completions
  context.subscriptions.push(registerCompletionProvider(context, serverUrl, provider));

  // Sidebar views
  const currentChangeProvider = new CurrentChangeViewProvider(serverUrl);
  const healthProvider   = new HealthViewProvider(context.extensionUri, serverUrl);
  const missionsProvider = new MissionsViewProvider(context.extensionUri, serverUrl);
  const chatProvider     = new ChatViewProvider(context.extensionUri, serverUrl, provider);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('openthunder.currentChange', currentChangeProvider),
    vscode.window.registerWebviewViewProvider('openthunder.health',   healthProvider),
    vscode.window.registerWebviewViewProvider('openthunder.missions', missionsProvider),
    vscode.window.registerWebviewViewProvider('openthunder.chat',     chatProvider),
  );

  // ── Commands ────────────────────────────────────────────────────────────────

  context.subscriptions.push(

    // Run Health Check: from command palette, sidebar, or context menu
    vscode.commands.registerCommand('openthunder.runHealthCheck', async (uri?: vscode.Uri) => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        vscode.window.showErrorMessage('OpenThunder: no workspace folder open. Open a folder to run a health check.');
        return;
      }

      // If triggered from explorer context menu with a specific folder, use that name
      const targetName = uri
        ? (uri.fsPath.split('/').pop() ?? folder.name)
        : folder.name;
      const targetPath = uri ? uri.fsPath : folder.uri.fsPath;
      const _ = targetName; // suppress unused warning

      // Reveal the health panel (initializes it if not open)
      await vscode.commands.executeCommand('openthunder.health.focus');

      // Trigger the check inside the webview (handles its own progress UI)
      healthProvider.triggerHealthCheck();
    }),

    // Open Full Report in dashboard (local when reachable, else the browser app)
    vscode.commands.registerCommand('openthunder.openHealthReport', () => openWorkbench()),

    // Copy health summary from latest report
    vscode.commands.registerCommand('openthunder.copyHealthSummary', async () => {
      try {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
          vscode.window.showErrorMessage('No workspace folder open.');
          return;
        }
        const projectId = folder.uri.fsPath;
        const r = await fetch(`${serverUrl()}/api/health-check/latest/${encodeURIComponent(projectId)}`,
          { signal: AbortSignal.timeout(4000) });
        if (!r.ok) {
          vscode.window.showWarningMessage('No health report found. Run a health check first.');
          return;
        }
        const d = await r.json() as { report: { grade: string; score: number; report_json: string; project_name: string } };
        const rep = d.report;
        let summary: string;
        try {
          const data = JSON.parse(rep.report_json) as { shareSummary?: string };
          summary = data.shareSummary ?? '';
        } catch { summary = ''; }
        if (!summary) {
          summary = `${rep.project_name} scored ${rep.grade} on OpenThunder (${rep.score}/100). AI helped build it, OpenThunder helped me own it. #OpenThunder #AICode`;
        }
        await vscode.env.clipboard.writeText(summary);
        vscode.window.showInformationMessage('Health summary copied to clipboard.');
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to copy: ${(e as Error).message}`);
      }
    }),

    // Explain This Repo: open dashboard repositories page
    vscode.commands.registerCommand('openthunder.explainRepo', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }
      // Navigate to repositories page where Explain App button lives
      await openWorkbench('/#/repositories');
    }),

    // Create Mission from Selection
    vscode.commands.registerCommand('openthunder.newMission', async () => {
      const editor    = vscode.window.activeTextEditor;
      const selection = editor?.document.getText(editor.selection) ?? '';
      const filePath  = editor?.document.fileName ?? '';

      const title = await vscode.window.showInputBox({
        prompt: 'Mission title',
        value: selection
          ? `Review: ${selection.substring(0, 40).replace(/\n/g, ' ')}`
          : 'OpenThunder Mission',
        placeHolder: 'What should OpenThunder investigate or fix?',
      });
      if (!title) return;

      const goal = selection
        ? `Review the selected code in ${filePath}.\n\nCode:\n\`\`\`\n${selection.substring(0, 3000)}\n\`\`\`\n\nExplain its role in the architecture, identify risks, and recommend a safe improvement plan before making any changes.`
        : title;

      try {
        const res = await fetch(`${serverUrl()}/api/missions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, goal, mode: 'standard' }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        missionsProvider.refresh();
        const action = await vscode.window.showInformationMessage(
          `Mission created: ${title}`,
          'Open Dashboard',
        );
        if (action === 'Open Dashboard') {
          vscode.commands.executeCommand('openthunder.openDashboard');
        }
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to create mission: ${(e as Error).message}`);
      }
    }),

    // Open Dashboard (local when reachable, else the browser app)
    vscode.commands.registerCommand('openthunder.openDashboard', () => openWorkbench()),

    // Open any OpenThunder view as an embedded editor tab (feels like a complete plugin,
    // more than just Missions/Chat). Relays the local engine's dashboard sections.
    vscode.commands.registerCommand('openthunder.open', async () => {
      const items = [
        { label: '$(home) Dashboard', hash: '#/dashboard' },
        { label: '$(git-branch) Missions', hash: '#/missions' },
        { label: '$(folder-library) Repositories', hash: '#/repositories' },
        { label: '$(circuit-board) Architecture Lens', hash: '#/lens' },
        { label: '$(shield) Security Lens', hash: '#/security' },
        { label: '$(mortar-board) Repository Mastery', hash: '#/mastery' },
        { label: '$(checklist) Reports', hash: '#/reports' },
        { label: '$(lock) Trust & Privacy', hash: '#/trust' },
      ];
      const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Open an OpenThunder view in the editor' });
      if (pick) await openWorkbench(pick.hash);
    }),

    // Can I Ship? — reveal + refresh the Current Change panel (relays the engine's verdict)
    vscode.commands.registerCommand('openthunder.verifyChanges', async () => {
      await vscode.commands.executeCommand('openthunder.currentChange.focus');
      currentChangeProvider.refresh();
    }),

    // Trust & Data Activity — relay the local engine's trust status into VS Code
    vscode.commands.registerCommand('openthunder.trust', async () => {
      const openCenter = () => vscode.env.openExternal(vscode.Uri.parse('https://openthunder.dev/docs/trust.html'));
      try {
        const r = await fetch(`${serverUrl()}/api/trust/status`, { signal: AbortSignal.timeout(3000) });
        if (!r.ok) { openCenter(); return; }
        const s = await r.json() as { mode?: string; externalRequests?: number; blocked?: number };
        const mode = s.mode === 'local-only' ? 'Local Only (network locked)' : 'Standard';
        const pick = await vscode.window.showInformationMessage(
          `OpenThunder — Mode: ${mode}. Requests that left this machine: ${s.externalRequests ?? 0} (blocked: ${s.blocked ?? 0}). Telemetry: off. Account: not required for local use.`,
          'Open Data Activity', 'Trust Center',
        );
        if (pick === 'Open Data Activity') openWorkbench();
        if (pick === 'Trust Center') openCenter();
      } catch {
        openCenter();
      }
    }),

    // Connect / Run Locally: the "prefer local, offer browser" entry point. Shown
    // on the connection status bar and in the command palette.
    vscode.commands.registerCommand('openthunder.connect', async () => {
      await refreshConnection();
      type Item = vscode.QuickPickItem & { action: string };
      const items: Item[] = localReachable
        ? [
            { label: '$(dashboard) Open Local Dashboard', description: serverUrl().replace(':7700', ':5173'), action: 'local' },
            { label: '$(globe) Use in Browser', description: cloudUrl(), action: 'cloud' },
            { label: '$(refresh) Recheck Connection', action: 'recheck' },
          ]
        : [
            { label: '$(cloud-download) Download OpenThunder Desktop', description: 'Run OpenThunder locally so the plugin connects directly', action: 'download' },
            { label: '$(globe) Use in Browser', description: cloudUrl(), action: 'cloud' },
            { label: '$(refresh) Recheck Connection', action: 'recheck' },
            { label: '$(gear) Open Settings', action: 'settings' },
          ];
      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: localReachable
          ? 'Connected to local OpenThunder'
          : 'Local OpenThunder is not running',
      });
      if (!pick) return;
      switch (pick.action) {
        case 'local':    vscode.env.openExternal(vscode.Uri.parse(serverUrl().replace(':7700', ':5173'))); break;
        case 'cloud':    vscode.env.openExternal(vscode.Uri.parse(cloudUrl())); break;
        case 'download': vscode.env.openExternal(vscode.Uri.parse(DOWNLOAD_URL)); break;
        case 'settings': vscode.commands.executeCommand('workbench.action.openSettings', 'openthunder.serverUrl'); break;
        case 'recheck':
          await refreshConnection();
          vscode.window.showInformationMessage(
            localReachable ? 'Connected to local OpenThunder.' : 'Local OpenThunder is still not reachable.',
          );
          break;
      }
    }),

    // Toggle completions
    vscode.commands.registerCommand('openthunder.toggleCompletions', async () => {
      const cfg     = config();
      const current = cfg.get<boolean>('completionsEnabled', false);
      await cfg.update('completionsEnabled', !current, vscode.ConfigurationTarget.Global);
      updateStatusBar(!current);
      vscode.window.showInformationMessage(
        `OpenThunder completions ${!current ? 'enabled' : 'disabled'}`,
      );
    }),

    // Offline, CLI-backed commands below. No server, no login required.

    // Copy AI Context Pack: paste-ready repo context for any AI coding tool
    vscode.commands.registerCommand('openthunder.copyContextPack', async () => {
      const folder = requireWorkspaceFolder();
      if (!folder) return;
      const result = await runCliWithProgress('Building AI Context Pack', 'context-pack', folder);
      if (!result) return;
      await vscode.env.clipboard.writeText(result);
      vscode.window.showInformationMessage(
        'AI Context Pack copied. Paste it into Claude Code, Cursor, Copilot, or Codex.',
        'Deeper repo-aware pack',
      ).then(action => {
        if (action) vscode.env.openExternal(vscode.Uri.parse('https://openthunder.ai'));
      });
    }),

    // Review Current Diff: offline review of uncommitted changes
    vscode.commands.registerCommand('openthunder.reviewDiff', async () => {
      const folder = requireWorkspaceFolder();
      if (!folder) return;
      const result = await runCliWithProgress('Reviewing current diff', 'review-diff', folder);
      if (!result) return;
      await openMarkdownDocument(result);
      vscode.window.showInformationMessage(
        'Diff review complete. For architecture and security impact plus merge readiness, try OpenThunder Cloud.',
        'Learn more',
      ).then(action => {
        if (action) vscode.env.openExternal(vscode.Uri.parse('https://openthunder.ai'));
      });
    }),

    // Generate PR Summary: PR-ready summary, opened and copied
    vscode.commands.registerCommand('openthunder.prSummary', async () => {
      const folder = requireWorkspaceFolder();
      if (!folder) return;
      const result = await runCliWithProgress('Generating PR summary', 'pr-summary', folder);
      if (!result) return;
      await vscode.env.clipboard.writeText(result);
      await openMarkdownDocument(result);
      vscode.window.showInformationMessage(
        'PR summary opened and copied. For shareable team review packets with verification evidence, try OpenThunder Cloud.',
        'Learn more',
      ).then(action => {
        if (action) vscode.env.openExternal(vscode.Uri.parse('https://openthunder.ai'));
      });
    }),

    // Open Repo in OpenThunder Desktop: deep link first, dashboard as fallback
    vscode.commands.registerCommand('openthunder.openInDesktop', async () => {
      const folder = requireWorkspaceFolder();
      if (!folder) return;
      try {
        // Best-effort deep link; succeeds silently when Desktop is installed
        const deepLink = vscode.Uri.parse(
          'openthunder://open?path=' + encodeURIComponent(folder.uri.fsPath),
        );
        await vscode.env.openExternal(deepLink);
      } catch {
        // Deep link unavailable; fall through to the dashboard offer
      }
      vscode.window.showInformationMessage(
        'Asked OpenThunder Desktop to open this repo. Nothing happened? Open the dashboard or get Desktop.',
        'Open Dashboard',
        'Get Desktop',
      ).then(action => {
        if (action === 'Open Dashboard') {
          vscode.commands.executeCommand('openthunder.openDashboard');
        } else if (action === 'Get Desktop') {
          vscode.env.openExternal(vscode.Uri.parse('https://openthunder.dev'));
        }
      });
    }),

    // Set up Claude Code: wire this repo so Claude Code works well with OpenThunder
    // (MCP Context Brain tools + a CLAUDE.md guidance section + trace hooks).
    vscode.commands.registerCommand('openthunder.setupClaude', async () => {
      const folder = requireWorkspaceFolder();
      if (!folder) return;
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'OpenThunder: Setting up Claude Code...' },
        () => runCli('claude', ['setup', '--repo', folder.uri.fsPath], folder.uri.fsPath),
      );
      if (result.notFound) {
        showCliNotFound();
        return;
      }
      if (!result.ok) {
        vscode.window.showErrorMessage(`OpenThunder: Claude Code setup failed: ${result.stderr.slice(0, 300)}`);
        return;
      }
      const notInstalled = /not on your PATH/i.test(result.stdout);
      vscode.window.showInformationMessage(
        notInstalled
          ? 'Repo wired for Claude Code (Context Brain tools, CLAUDE.md, trace hooks). Claude Code is not installed yet.'
          : 'Claude Code is set up for this repo: Context Brain tools, CLAUDE.md guidance, and trace hooks. Restart Claude Code to pick up the tools.',
        ...(notInstalled ? ['Install Claude Code'] : []),
      ).then(action => {
        if (action === 'Install Claude Code') {
          const term = vscode.window.createTerminal('OpenThunder: Install Claude Code');
          term.show();
          term.sendText('openthunder claude install');
        }
      });
    }),

    // Install OpenThunder MCP Server: wire the Repo Knowledge Graph into an agent client
    vscode.commands.registerCommand('openthunder.installMcp', async () => {
      const folder = requireWorkspaceFolder();
      if (!folder) return;

      const pick = await vscode.window.showQuickPick(
        [
          { label: 'Claude Code', client: 'claude' },
          { label: 'Cursor', client: 'cursor' },
          { label: 'Codex', client: 'codex' },
          { label: 'All', client: 'all' },
        ],
        { placeHolder: 'Install the OpenThunder MCP server for which client?' },
      );
      if (!pick) return;

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `OpenThunder: Installing MCP server for ${pick.label}...`,
        },
        () => runCli('mcp', ['install', '--client', pick.client, '--repo', folder.uri.fsPath], folder.uri.fsPath),
      );
      if (result.notFound) {
        showCliNotFound();
        return;
      }
      if (!result.ok) {
        vscode.window.showErrorMessage(`OpenThunder MCP install failed: ${result.stderr.slice(0, 300)}`);
        return;
      }
      const restartTarget = pick.client === 'all' ? 'your agent clients' : pick.label;
      vscode.window.showInformationMessage(
        `OpenThunder MCP installed for ${pick.label}. Restart ${restartTarget} to pick up the server.`,
      );
    }),
  );

  // Resolve the first workspace folder, or explain why we stopped
  function requireWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showErrorMessage('OpenThunder: no workspace folder open. Open a folder first.');
    }
    return folder;
  }

  // Run a CLI verb with progress UI; returns stdout, or undefined after showing an error
  async function runCliWithProgress(
    title: string,
    verb: string,
    folder: vscode.WorkspaceFolder,
  ): Promise<string | undefined> {
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `OpenThunder: ${title}...` },
      () => runCli(verb, ['-C', folder.uri.fsPath], folder.uri.fsPath),
    );
    if (result.notFound) {
      showCliNotFound();
      return undefined;
    }
    if (!result.ok) {
      vscode.window.showErrorMessage(`OpenThunder ${verb} failed: ${result.stderr.slice(0, 300)}`);
      return undefined;
    }
    return result.stdout;
  }

  // Open text in a new untitled Markdown editor
  async function openMarkdownDocument(content: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  // Open the OpenThunder workbench. Prefer local, offer browser: if the local
  // server is reachable, open the local dashboard; otherwise open the cloud app
  // in the browser. A fresh probe runs first so the routing is accurate.
  // Ask the local engine where its dashboard is served (works in the packaged desktop
  // app, which now serves the SPA over HTTP). Falls back to the vite dev port.
  async function localDashboardUrl(): Promise<string> {
    try {
      const r = await fetch(`${serverUrl()}/api/client-config`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const c = await r.json() as { dashboardUrl?: string | null };
        if (c.dashboardUrl) return c.dashboardUrl.replace(/\/$/, '');
      }
    } catch { /* fall back */ }
    return serverUrl().replace(':7700', ':5173');
  }

  // The local OpenThunder dashboard (http/localhost) opens as an EMBEDDED VS Code tab
  // beside your code, so OT feels like a complete in-editor plugin. HTTPS (the cloud
  // app, Skills Tech Talk sign-in, anything external) opens in the real browser, where
  // OAuth and cross-site cookies work.
  async function openEmbeddedOrExternal(url: string): Promise<void> {
    if (url.startsWith('https://')) { await vscode.env.openExternal(vscode.Uri.parse(url)); return; }
    try { await vscode.commands.executeCommand('simpleBrowser.api.open', vscode.Uri.parse(url), { viewColumn: vscode.ViewColumn.Beside }); return; }
    catch { /* try the simpler command */ }
    try { await vscode.commands.executeCommand('simpleBrowser.show', url); return; }
    catch { await vscode.env.openExternal(vscode.Uri.parse(url)); }
  }

  async function openWorkbench(hash = ''): Promise<void> {
    await refreshConnection();
    const base = localReachable ? await localDashboardUrl() : cloudUrl();
    await openEmbeddedOrExternal(base + hash);
  }

  // Probe the local server and reflect the result on the connection status bar.
  async function refreshConnection(): Promise<void> {
    const url = serverUrl();
    let ok = false;
    try {
      const res = await fetch(`${url}/api/auth/config`, { signal: AbortSignal.timeout(3000) });
      ok = res.ok;
    } catch {
      ok = false;
    }
    localReachable = ok;
    if (ok) {
      connBar.text = '$(zap) OpenThunder: Local';
      connBar.tooltip = 'Connected to local OpenThunder at ' + url + '. Click for options.';
      connBar.backgroundColor = undefined;
    } else {
      connBar.text = '$(cloud-download) OpenThunder: Run Locally';
      connBar.tooltip = 'Local OpenThunder is not running. Click to download it or use the browser.';
      connBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
  }

  // Re-register completion provider + reprobe on config change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('openthunder.completionsEnabled')) {
        updateStatusBar(config().get<boolean>('completionsEnabled', false));
      }
      if (e.affectsConfiguration('openthunder.serverUrl') || e.affectsConfiguration('openthunder.cloudUrl')) {
        refreshConnection();
      }
    }),
  );

  // Probe on startup so the status bar reflects reality; stays silent (the
  // always-visible status bar is the affordance, no need to nag with a toast).
  refreshConnection();
}

function updateStatusBar(enabled: boolean) {
  statusBar.text    = enabled ? '$(sparkle) OT' : '$(circle-slash) OT';
  statusBar.tooltip = enabled
    ? 'OpenThunder completions on (click to disable)'
    : 'OpenThunder completions off (click to enable)';
  statusBar.color = enabled
    ? new vscode.ThemeColor('statusBar.foreground')
    : new vscode.ThemeColor('statusBar.warningForeground');
}

export function deactivate() {}
