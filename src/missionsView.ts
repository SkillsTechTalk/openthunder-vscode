import * as vscode from 'vscode';

interface Mission {
  id: string;
  title: string;
  status: string;
  builder_provider: string;
  created_at: string;
  updated_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  draft:                 '#6e7681',
  contract_ready:        '#58a6ff',
  building:              '#f0ad4e',
  reviewing:             '#9b6fff',
  verified:              '#3fb950',
  completed_with_risks:  '#f0ad4e',
  changes_requested:     '#f85149',
  build_failed:          '#f85149',
  verification_failed:   '#f85149',
  cancelled:             '#6e7681',
};

const STATUS_LABEL: Record<string, string> = {
  draft:                 'Draft',
  contract_ready:        'Ready',
  building:              '⟳ Building',
  reviewing:             '⟳ Reviewing',
  verified:              '✓ Verified',
  completed_with_risks:  '⚠ Risks',
  changes_requested:     '✕ Changes needed',
  build_failed:          '✕ Build failed',
  verification_failed:   '✕ Verify failed',
  cancelled:             'Cancelled',
};

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
}

export class MissionsViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly serverUrl: () => string,
  ) {}

  refresh() { this.view?.webview.postMessage({ type: 'refresh' }); }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg: { type: string; missionId?: string; status?: string }) => {
      switch (msg.type) {
        case 'openDashboard':
          vscode.commands.executeCommand('openthunder.openDashboard');
          break;
        case 'newMission':
          vscode.commands.executeCommand('openthunder.newMission');
          break;
        case 'openMission': {
          if (!msg.missionId) break;
          const base = this.serverUrl().replace(':7700', ':5173');
          vscode.env.openExternal(vscode.Uri.parse(`${base}?mission=${msg.missionId}`));
          break;
        }
        case 'openTrace': {
          if (!msg.missionId) break;
          try {
            const res = await fetch(`${this.serverUrl()}/api/missions/${msg.missionId}/share`, { method: 'POST' });
            if (res.ok) {
              const d = await res.json() as { shareToken: string };
              const base = this.serverUrl().replace(':7700', ':5173');
              vscode.env.openExternal(vscode.Uri.parse(`${base}/#/share/${d.shareToken}`));
            }
          } catch {}
          break;
        }
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const serverUrl = this.serverUrl();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src ${serverUrl};">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); margin: 0; padding: 8px; }

  .toolbar { display: flex; gap: 4px; margin-bottom: 10px; }
  .btn-new { flex: 1; padding: 5px 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; cursor: pointer; font-size: 12px; }
  .btn-new:hover { background: var(--vscode-button-hoverBackground); }
  .btn-dash { padding: 5px 8px; background: transparent; color: var(--vscode-descriptionForeground); border: 1px solid var(--vscode-widget-border); border-radius: 3px; cursor: pointer; font-size: 11px; }
  .btn-dash:hover { background: var(--vscode-list-hoverBackground); }

  .filter-bar { display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }
  .filter-chip { padding: 2px 8px; border-radius: 10px; border: 1px solid var(--vscode-widget-border); background: transparent; color: var(--vscode-descriptionForeground); font-size: 10px; cursor: pointer; }
  .filter-chip.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }

  .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--vscode-sideBarSectionHeader-foreground); margin: 8px 0 4px; font-weight: 600; }

  .mission { padding: 7px 8px; margin-bottom: 4px; border-radius: 4px; cursor: pointer; border: 1px solid var(--vscode-widget-border); background: var(--vscode-sideBar-background); }
  .mission:hover { background: var(--vscode-list-hoverBackground); }
  .mission-title { font-size: 12px; font-weight: 500; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mission-row { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
  .status-pill { font-size: 10px; padding: 1px 6px; border-radius: 8px; white-space: nowrap; }
  .mission-meta { font-size: 10px; color: var(--vscode-descriptionForeground); }
  .mission-actions { display: none; gap: 4px; margin-top: 5px; }
  .mission:hover .mission-actions { display: flex; }
  .action-btn { font-size: 10px; padding: 2px 7px; border-radius: 3px; border: 1px solid var(--vscode-widget-border); background: transparent; color: var(--vscode-descriptionForeground); cursor: pointer; }
  .action-btn:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }

  .loading { color: var(--vscode-descriptionForeground); font-size: 12px; padding: 8px 0; }
  .error { color: var(--vscode-errorForeground); font-size: 11px; padding: 8px 0; line-height: 1.5; }
  .empty { color: var(--vscode-descriptionForeground); font-size: 11px; padding: 8px 0; }

  .stats { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
  .stat { font-size: 10px; padding: 2px 7px; border-radius: 10px; border: 1px solid var(--vscode-widget-border); color: var(--vscode-descriptionForeground); }
  .stat.green { border-color: #3fb950; color: #3fb950; }
  .stat.blue  { border-color: #58a6ff; color: #58a6ff; }
  .stat.amber { border-color: #f0ad4e; color: #f0ad4e; }
  .stat.red   { border-color: #f85149; color: #f85149; }
</style>
</head>
<body>

<div class="toolbar">
  <button class="btn-new" id="newBtn">+ New Mission</button>
  <button class="btn-dash" id="dashBtn">Dashboard ↗</button>
</div>

<div id="stats" class="stats"></div>
<div id="filter-bar" class="filter-bar">
  <button class="filter-chip active" data-filter="all">All</button>
  <button class="filter-chip" data-filter="active">Active</button>
  <button class="filter-chip" data-filter="done">Done</button>
  <button class="filter-chip" data-filter="failed">Failed</button>
</div>

<div id="list"><div class="loading">Loading…</div></div>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const SERVER = '__SERVER_URL__';

const STATUS_COLOR = ${JSON.stringify(STATUS_COLOR)};
const STATUS_LABEL = ${JSON.stringify(STATUS_LABEL)};

let allMissions = [];
let activeFilter = 'all';

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? hrs + 'h ago' : Math.floor(hrs / 24) + 'd ago';
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function loadMissions() {
  try {
    const r = await fetch(SERVER + '/api/missions?limit=50');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    allMissions = d.missions ?? [];
    render();
  } catch(e) {
    document.getElementById('list').innerHTML = '<div class="error">Could not reach OpenThunder server.<br>Start with: <code>pnpm dev:server</code><br>or launch the desktop app.</div>';
    document.getElementById('stats').innerHTML = '';
  }
}

function filterMissions(missions) {
  if (activeFilter === 'all') return missions;
  if (activeFilter === 'active') return missions.filter(m => ['building','reviewing','contract_ready','draft'].includes(m.status));
  if (activeFilter === 'done') return missions.filter(m => ['verified','completed_with_risks'].includes(m.status));
  if (activeFilter === 'failed') return missions.filter(m => ['build_failed','verification_failed','changes_requested','cancelled'].includes(m.status));
  return missions;
}

function render() {
  const filtered = filterMissions(allMissions);

  // Stats
  const verified = allMissions.filter(m => m.status === 'verified').length;
  const running  = allMissions.filter(m => ['building','reviewing'].includes(m.status)).length;
  const failed   = allMissions.filter(m => ['build_failed','verification_failed'].includes(m.status)).length;
  const total    = allMissions.length;
  document.getElementById('stats').innerHTML =
    '<span class="stat">' + total + ' total</span>' +
    (verified ? '<span class="stat green">' + verified + ' verified</span>' : '') +
    (running  ? '<span class="stat blue">'  + running  + ' running</span>'  : '') +
    (failed   ? '<span class="stat red">'   + failed   + ' failed</span>'   : '');

  const el = document.getElementById('list');
  if (!filtered.length) { el.innerHTML = '<div class="empty">No missions' + (activeFilter !== 'all' ? ' in this filter' : ' yet') + '.</div>'; return; }

  // Group: active first, then recent
  const active = filtered.filter(m => ['building','reviewing'].includes(m.status));
  const rest   = filtered.filter(m => !['building','reviewing'].includes(m.status));

  let html = '';
  if (active.length) {
    html += '<div class="section-label">Active</div>';
    html += active.map(missionHtml).join('');
  }
  if (rest.length) {
    if (active.length) html += '<div class="section-label">Recent</div>';
    html += rest.map(missionHtml).join('');
  }
  el.innerHTML = html;

  el.querySelectorAll('.mission').forEach(function(el) {
    var mid = el.dataset.id;
    el.querySelector('.mission-title-area')?.addEventListener('click', () =>
      vscode.postMessage({ type: 'openMission', missionId: mid }));
    el.querySelector('.btn-trace')?.addEventListener('click', function(e) {
      e.stopPropagation();
      vscode.postMessage({ type: 'openTrace', missionId: mid });
    });
  });
}

function missionHtml(m) {
  const color = STATUS_COLOR[m.status] || '#6e7681';
  const label = STATUS_LABEL[m.status] || m.status;
  const spinning = ['building','reviewing'].includes(m.status);
  return \`<div class="mission" data-id="\${esc(m.id)}">
    <div class="mission-title mission-title-area">\${spinning ? '⟳ ' : ''}\${esc(m.title)}</div>
    <div class="mission-row">
      <span class="mission-meta">\${esc(m.builder_provider || '')} · \${timeAgo(m.updated_at || m.created_at)}</span>
      <span class="status-pill" style="background:\${color}22;color:\${color};">\${esc(label)}</span>
    </div>
    <div class="mission-actions">
      <button class="action-btn btn-trace">Share trace ↗</button>
    </div>
  </div>\`;
}

document.getElementById('newBtn').addEventListener('click', () => vscode.postMessage({ type: 'newMission' }));
document.getElementById('dashBtn').addEventListener('click', () => vscode.postMessage({ type: 'openDashboard' }));

document.getElementById('filter-bar').querySelectorAll('.filter-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

window.addEventListener('message', e => { if (e.data.type === 'refresh') loadMissions(); });

loadMissions();
setInterval(loadMissions, 10000);
</script>
</body>
</html>`.replace('__SERVER_URL__', serverUrl);
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
