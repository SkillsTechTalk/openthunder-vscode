import * as vscode from 'vscode';

function getNonce(): string {
  let t = '';
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) t += c.charAt(Math.floor(Math.random() * c.length));
  return t;
}

export class HealthViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private pendingTrigger = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly serverUrl: () => string,
  ) {}

  public refresh() {
    this.view?.webview.postMessage({ type: 'refresh' });
  }

  public triggerHealthCheck() {
    if (this.view) {
      this.view.webview.postMessage({ type: 'triggerHealthCheck' });
    } else {
      this.pendingTrigger = true;
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    if (this.pendingTrigger) {
      this.pendingTrigger = false;
      setTimeout(() => this.view?.webview.postMessage({ type: 'triggerHealthCheck' }), 600);
    }

    webviewView.webview.onDidReceiveMessage(async (msg: {
      type: string;
      reportId?: string;
      text?: string;
      title?: string;
      goal?: string;
      mode?: string;
    }) => {
      const base = this.serverUrl().replace(':7700', ':5173');

      switch (msg.type) {
        case 'openReport':
          vscode.env.openExternal(vscode.Uri.parse(msg.reportId
            ? `${base}/#/health/${msg.reportId}`
            : base));
          break;

        case 'openDashboard':
          vscode.env.openExternal(vscode.Uri.parse(base));
          break;

        case 'copyText':
          if (msg.text) {
            await vscode.env.clipboard.writeText(msg.text);
            vscode.window.showInformationMessage('Health summary copied to clipboard.');
          }
          break;

        case 'createMission': {
          if (!msg.title || !msg.goal) break;
          try {
            const res = await fetch(`${this.serverUrl()}/api/missions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: msg.title,
                goal: msg.goal,
                mode: msg.mode ?? 'standard',
              }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const action = await vscode.window.showInformationMessage(
              `Mission created: ${msg.title}`,
              'Open Dashboard',
            );
            if (action === 'Open Dashboard') {
              vscode.env.openExternal(vscode.Uri.parse(base));
            }
          } catch (e) {
            vscode.window.showErrorMessage(`Failed to create mission: ${(e as Error).message}`);
          }
          break;
        }
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce    = getNonce();
    const server   = this.serverUrl();
    const folders  = vscode.workspace.workspaceFolders;
    const wsFolder = folders?.[0];
    const wsPath   = wsFolder?.uri.fsPath ?? '';
    const wsName   = wsFolder?.name ?? 'No workspace';

    // Safe JS string literals
    const jsServer = JSON.stringify(server);
    const jsPath   = JSON.stringify(wsPath);
    const jsName   = JSON.stringify(wsName);

    // Safe HTML display values
    const htmlName = wsName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const htmlPath = wsPath.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src ${server};">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { box-sizing: border-box; }
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-sideBar-background);
  margin: 0; padding: 10px;
}
.tagline { font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 10px; line-height: 1.5; font-style: italic; }
.conn-row { display: flex; align-items: center; gap: 5px; margin-bottom: 8px; font-size: 11px; color: var(--vscode-descriptionForeground); }
.conn-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: #6e7681; }
.conn-dot.ok  { background: #3fb950; }
.conn-dot.err { background: #f85149; }
.ws-name { font-size: 12px; font-weight: 600; color: var(--vscode-foreground); margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-path { font-size: 10px; color: var(--vscode-descriptionForeground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 10px; }
.grade-card {
  background: var(--vscode-editor-inactiveSelectionBackground);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 5px; padding: 10px 12px; margin-bottom: 10px;
  display: flex; align-items: center; gap: 12px;
}
.grade-letter { font-size: 36px; font-weight: 800; line-height: 1; font-family: monospace; }
.grade-meta { flex: 1; overflow: hidden; }
.grade-score { font-size: 11px; color: var(--vscode-descriptionForeground); }
.grade-time  { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
.grade-risks { font-size: 11px; margin-top: 4px; }
.grade-risks.none { color: #3fb950; }
.grade-risks.some { color: #f0ad4e; }
.grade-risks.many { color: #f85149; }
.section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--vscode-sideBarSectionHeader-foreground); margin: 6px 0 4px; font-weight: 600; }
.risk-item { padding: 5px 7px; border-radius: 3px; border-left: 2px solid; margin-bottom: 3px; font-size: 11px; line-height: 1.4; cursor: default; }
.risk-item.critical { border-color: #f85149; background: rgba(248,81,73,0.08); }
.risk-item.high     { border-color: #f97316; background: rgba(249,115,22,0.08); }
.risk-item.medium   { border-color: #f0ad4e; background: rgba(240,173,78,0.08); }
.risk-item.low      { border-color: #6e7681; background: rgba(110,118,129,0.08); }
.risk-title { font-weight: 500; }
.risk-sev { font-size: 9px; text-transform: uppercase; letter-spacing: 0.07em; opacity: 0.7; margin-top: 1px; }
.risk-mission-btn { font-size: 9px; margin-top: 4px; padding: 2px 6px; border-radius: 2px; border: 1px solid var(--vscode-widget-border); background: transparent; color: var(--vscode-descriptionForeground); cursor: pointer; }
.risk-mission-btn:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }
.btn-primary { width: 100%; padding: 6px 10px; border: none; border-radius: 3px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); font-size: 12px; font-weight: 500; cursor: pointer; margin-bottom: 5px; }
.btn-primary:hover { background: var(--vscode-button-hoverBackground); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { padding: 5px 10px; border-radius: 3px; background: transparent; color: var(--vscode-descriptionForeground); border: 1px solid var(--vscode-widget-border); font-size: 11px; cursor: pointer; }
.btn-secondary:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }
.btn-row { display: flex; gap: 4px; margin-bottom: 5px; }
.btn-row .btn-secondary { flex: 1; }
.progress-msg { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; font-style: italic; }
.error-msg { font-size: 11px; color: var(--vscode-errorForeground); margin-bottom: 8px; line-height: 1.5; }
.empty-state { font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.6; margin-bottom: 10px; }
.sep { border: none; border-top: 1px solid var(--vscode-widget-border); margin: 8px 0; }
.spin { display: inline-block; animation: s 1s linear infinite; }
@keyframes s { to { transform: rotate(360deg); } }
</style>
</head>
<body>

<div class="tagline">Own the code AI wrote for you.</div>

<div class="conn-row">
  <div class="conn-dot" id="connDot"></div>
  <span id="connLabel">Checking server…</span>
</div>

<div class="ws-name">${htmlName}</div>
<div class="ws-path">${htmlPath}</div>

<div id="content">
  <div class="empty-state">Run a health check to understand the architecture, risks, and production readiness of this codebase.</div>
  <button class="btn-primary" id="initRunBtn">&#x26A1; Run Health Check</button>
</div>

<script nonce="${nonce}">
(function() {
var vscode = acquireVsCodeApi();
var SERVER = ${jsServer};
var WORKSPACE_PATH = ${jsPath};
var WORKSPACE_NAME = ${jsName};
var PROJECT_ID = WORKSPACE_PATH || 'unknown';

var pollTimer = null;
var latestReport = null;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function timeAgo(ts) {
  if (!ts) return '';
  var d = Date.now() - new Date(ts).getTime();
  var m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  var h = Math.floor(m / 60);
  return h < 24 ? h + 'h ago' : Math.floor(h / 24) + 'd ago';
}

function gradeColor(g) {
  if (!g || g === '?') return '#6e7681';
  if (g[0] === 'A') return '#3fb950';
  if (g[0] === 'B') return '#58a6ff';
  if (g[0] === 'C') return '#f0ad4e';
  if (g[0] === 'D') return '#f97316';
  return '#f85149';
}

async function checkConn() {
  var dot = document.getElementById('connDot');
  var lbl = document.getElementById('connLabel');
  try {
    var r = await fetch(SERVER + '/api/auth/config', { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      dot.className = 'conn-dot ok';
      lbl.textContent = 'Connected';
      return true;
    }
  } catch(e) {}
  dot.className = 'conn-dot err';
  lbl.textContent = 'Server not running';
  showDisconnected();
  return false;
}

function showDisconnected() {
  document.getElementById('content').innerHTML =
    '<div class="error-msg">OpenThunder server is not running.<br>Start it with: <code>pnpm dev:server</code></div>' +
    '<button class="btn-secondary" id="retryConn">Retry</button>';
  document.getElementById('retryConn').onclick = function() {
    checkConn().then(function(ok) { if (ok) loadLatest(); });
  };
}

async function loadLatest() {
  if (!WORKSPACE_PATH) {
    document.getElementById('content').innerHTML =
      '<div class="empty-state">No workspace folder open. Open a folder to run a health check.</div>';
    return;
  }
  try {
    var r = await fetch(SERVER + '/api/health-check/latest/' + encodeURIComponent(PROJECT_ID));
    if (r.ok) {
      var d = await r.json();
      latestReport = d.report;
      if (d.report.status === 'analyzing') {
        showAnalyzing();
        startPoll(d.report.id);
      } else if (d.report.status === 'ready') {
        showReport(d.report);
      } else {
        showEmpty();
      }
    } else {
      showEmpty();
    }
  } catch(e) {
    showEmpty();
  }
}

function showEmpty() {
  document.getElementById('content').innerHTML =
    '<div class="empty-state">Run a health check to understand the architecture, risks, and production readiness of this codebase.</div>' +
    '<button class="btn-primary" id="runBtn">&#x26A1; Run Health Check</button>';
  document.getElementById('runBtn').onclick = runCheck;
}

function showAnalyzing() {
  document.getElementById('content').innerHTML =
    '<div class="progress-msg"><span class="spin">&#x21BB;</span> Analyzing codebase&hellip; (20&ndash;40s with AI)</div>';
}

function showReport(report) {
  latestReport = report;
  var data = null;
  try { data = JSON.parse(report.report_json); } catch(e) {}

  var grade = report.grade || '?';
  var color = gradeColor(grade);
  var risks = (data && data.topRisks) ? data.topRisks : [];
  var rc = risks.length;
  var rcClass = rc === 0 ? 'none' : rc <= 3 ? 'some' : 'many';
  var shareText = (data && data.shareSummary)
    ? data.shareSummary
    : (WORKSPACE_NAME + ' scored ' + grade + ' on OpenThunder. Score: ' + report.score + '/100. ' + rc + ' risks found. AI helped build it, OpenThunder helps own it.');

  var html =
    '<div class="grade-card">' +
      '<div class="grade-letter" style="color:' + color + '">' + esc(grade) + '</div>' +
      '<div class="grade-meta">' +
        '<div class="grade-score">Score: ' + esc(String(report.score)) + '/100</div>' +
        '<div class="grade-time">Scanned ' + esc(timeAgo(report.created_at)) + '</div>' +
        '<div class="grade-risks ' + rcClass + '">' + rc + ' risk' + (rc !== 1 ? 's' : '') + ' found</div>' +
      '</div>' +
    '</div>';

  if (rc > 0) {
    html += '<div class="section-label">Top Risks</div>';
    risks.slice(0, 3).forEach(function(r) {
      html +=
        '<div class="risk-item ' + esc(r.severity) + '" data-risk-title="' + esc(r.title) + '" data-risk-desc="' + esc(r.description || '') + '" data-risk-mode="' + esc(r.mode || 'standard') + '">' +
          '<div class="risk-title">' + esc(r.title) + '</div>' +
          '<div class="risk-sev">' + esc(r.severity) + '</div>' +
          '<button class="risk-mission-btn">Create cleanup mission &rarr;</button>' +
        '</div>';
    });
  } else {
    html += '<div class="progress-msg">No critical risks detected.</div>';
  }

  html +=
    '<button class="btn-primary" id="openReportBtn">Open Full Report &nearr;</button>' +
    '<div class="btn-row">' +
      '<button class="btn-secondary" id="copyBtn">Copy Summary</button>' +
      '<button class="btn-secondary" id="rerunBtn">&#x21BB; Rerun</button>' +
    '</div>';

  document.getElementById('content').innerHTML = html;

  document.getElementById('openReportBtn').onclick = function() {
    vscode.postMessage({ type: 'openReport', reportId: report.id });
  };
  document.getElementById('copyBtn').onclick = function() {
    vscode.postMessage({ type: 'copyText', text: shareText });
  };
  document.getElementById('rerunBtn').onclick = runCheck;

  document.querySelectorAll('.risk-mission-btn').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      var item = btn.closest('.risk-item');
      var title = item.dataset.riskTitle || '';
      var desc = item.dataset.riskDesc || '';
      vscode.postMessage({
        type: 'createMission',
        title: 'Fix: ' + title,
        goal: 'Review and fix the following risk in ' + WORKSPACE_NAME + ':\n\n' + title + '\n\n' + desc + '\n\nIdentify the root cause, propose a safe fix plan, and implement it.',
        mode: 'standard',
      });
    };
  });
}

async function runCheck() {
  if (!WORKSPACE_PATH) {
    document.getElementById('content').innerHTML =
      '<div class="error-msg">No workspace folder open.</div>';
    return;
  }
  var ok = await checkConn();
  if (!ok) return;

  showAnalyzing();

  try {
    var r = await fetch(SERVER + '/api/health-check/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: PROJECT_ID,
        projectName: WORKSPACE_NAME,
        projectPath: WORKSPACE_PATH,
      }),
    });
    if (!r.ok) {
      var err = await r.json().catch(function() { return {}; });
      document.getElementById('content').innerHTML =
        '<div class="error-msg">Failed to start: ' + esc((err && err.error) ? err.error : 'HTTP ' + r.status) + '</div>' +
        '<button class="btn-secondary" id="backBtn">Back</button>';
      document.getElementById('backBtn').onclick = showEmpty;
      return;
    }
    var d = await r.json();
    startPoll(d.reportId);
  } catch(e) {
    document.getElementById('content').innerHTML =
      '<div class="error-msg">Error: ' + esc(e.message) + '</div>' +
      '<button class="btn-secondary" id="backBtn">Back</button>';
    document.getElementById('backBtn').onclick = showEmpty;
  }
}

function startPoll(id) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async function() {
    try {
      var r = await fetch(SERVER + '/api/health-check/' + encodeURIComponent(id));
      if (!r.ok) return;
      var d = await r.json();
      var rep = d.report;
      if (rep.status === 'ready') {
        clearInterval(pollTimer); pollTimer = null;
        showReport(rep);
      } else if (rep.status === 'failed') {
        clearInterval(pollTimer); pollTimer = null;
        document.getElementById('content').innerHTML =
          '<div class="error-msg">Analysis failed: ' + esc(rep.error || 'unknown error') + '</div>' +
          '<button class="btn-primary" id="retryBtn">&#x21BB; Try Again</button>';
        document.getElementById('retryBtn').onclick = runCheck;
      }
    } catch(e) {}
  }, 2000);
}

document.getElementById('initRunBtn') && document.getElementById('initRunBtn').addEventListener('click', runCheck);

window.addEventListener('message', function(e) {
  if (e.data.type === 'refresh') loadLatest();
  if (e.data.type === 'triggerHealthCheck') runCheck();
});

// Auto-refresh grade every 30s when not polling
setInterval(function() {
  if (!pollTimer && document.getElementById('connDot').classList.contains('ok')) {
    loadLatest();
  }
}, 30000);

checkConn().then(function(ok) { if (ok) loadLatest(); });

})();
</script>
</body>
</html>`;
  }
}
