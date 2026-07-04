import * as vscode from 'vscode';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly serverUrl: () => string,
    private readonly aiProvider: () => string,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg: {
      type: string; message?: string; provider?: string; missionId?: string;
    }) => {
      switch (msg.type) {
        case 'send': {
          if (!msg.message) break;
          try {
            const editor = vscode.window.activeTextEditor;
            const selection = editor?.document.getText(editor.selection) ?? '';
            const filePath  = editor?.document.fileName ?? '';

            const prompt = selection
              ? `${msg.message}\n\nCode context (${filePath.split('/').pop()}):\n\`\`\`\n${selection.substring(0, 2000)}\n\`\`\``
              : msg.message;

            const res = await fetch(`${this.serverUrl()}/api/missions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: msg.message.substring(0, 60),
                prompt,
                status: 'active',
                builder_provider: msg.provider ?? this.aiProvider(),
              }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const d = await res.json() as { mission?: { id: string; title: string } };
            webviewView.webview.postMessage({ type: 'missionCreated', mission: d.mission });
          } catch (e) {
            webviewView.webview.postMessage({ type: 'error', message: (e as Error).message });
          }
          break;
        }
        case 'pollStatus': {
          if (!msg.missionId) break;
          try {
            const r = await fetch(`${this.serverUrl()}/api/missions/${msg.missionId}`);
            if (r.ok) {
              const d = await r.json() as { mission?: { status: string } };
              webviewView.webview.postMessage({ type: 'statusUpdate', missionId: msg.missionId, status: d.mission?.status });
            }
          } catch {}
          break;
        }
        case 'openMission': {
          if (!msg.missionId) break;
          const base = this.serverUrl().replace(':7700', ':5173');
          vscode.env.openExternal(vscode.Uri.parse(`${base}?mission=${msg.missionId}`));
          break;
        }
        case 'openDashboard':
          vscode.commands.executeCommand('openthunder.openDashboard');
          break;
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
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); margin: 0; padding: 8px; display: flex; flex-direction: column; height: 100vh; }
  #messages { flex: 1; overflow-y: auto; margin-bottom: 8px; display: flex; flex-direction: column; gap: 6px; }
  .msg { padding: 7px 9px; border-radius: 5px; font-size: 12px; line-height: 1.5; }
  .msg-system  { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 11px; }
  .msg-user    { background: var(--vscode-input-background); border-left: 2px solid #58a6ff; }
  .msg-mission { border-left: 2px solid #3fb950; background: var(--vscode-editor-inactiveSelectionBackground); }
  .msg-running { border-left: 2px solid #f0ad4e; background: var(--vscode-editor-inactiveSelectionBackground); }
  .msg-error   { border-left: 2px solid #f85149; background: var(--vscode-editor-inactiveSelectionBackground); color: var(--vscode-errorForeground); }
  .msg-title { font-weight: 600; margin-bottom: 3px; }
  .msg-meta  { font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
  .link { display: inline-block; color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: underline; font-size: 11px; margin-top: 3px; }
  .status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
  .provider-bar { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
  .provider-label { font-size: 10px; color: var(--vscode-descriptionForeground); }
  select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 3px; font-size: 11px; padding: 2px 4px; }
  .context-hint { font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; font-style: italic; }
  #form { display: flex; gap: 4px; }
  textarea { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 6px; font-family: inherit; font-size: 12px; resize: none; }
  textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
  button.send { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 12px; align-self: flex-end; }
  button.send:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>

<div class="provider-bar">
  <span class="provider-label">Model:</span>
  <select id="provider">
    <option value="mock">Mock (offline)</option>
    <option value="anthropic">Claude</option>
    <option value="openai">GPT-4o</option>
    <option value="groq">Groq</option>
    <option value="openrouter">OpenRouter</option>
  </select>
  <span class="link" id="dashLink" style="margin-left: auto;">Dashboard ↗</span>
</div>

<div id="context-hint" class="context-hint" style="display:none;"></div>

<div id="messages">
  <div class="msg msg-system">Describe what you want the AI to build. If you have code selected, it will be included as context.</div>
</div>

<form id="form" onsubmit="return false;">
  <textarea id="input" placeholder="What should the AI build or fix?" rows="3"></textarea>
  <button class="send" id="sendBtn" type="button">Run</button>
</form>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const messages = document.getElementById('messages');
const input = document.getElementById('input');
const providerSel = document.getElementById('provider');
const contextHint = document.getElementById('context-hint');

// Track active missions for polling
const polling = {};

function addMsg(cls, html) {
  const el = document.createElement('div');
  el.className = 'msg ' + cls;
  el.innerHTML = html;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
  return el;
}

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function statusColor(s) {
  const map = { verified:'#3fb950', completed_with_risks:'#f0ad4e', building:'#f0ad4e', reviewing:'#9b6fff', changes_requested:'#f85149', build_failed:'#f85149', verification_failed:'#f85149' };
  return map[s] || '#6e7681';
}
function statusLabel(s) {
  const map = { verified:'Verified ✓', completed_with_risks:'Done (risks)', building:'Building…', reviewing:'Reviewing…', changes_requested:'Changes needed', build_failed:'Build failed', verification_failed:'Verify failed', draft:'Draft', contract_ready:'Ready to run', cancelled:'Cancelled' };
  return map[s] || s;
}

function send() {
  const text = input.value.trim();
  if (!text) return;
  addMsg('msg-user', esc(text));
  input.value = '';
  vscode.postMessage({ type: 'send', message: text, provider: providerSel.value });
}

document.getElementById('sendBtn').addEventListener('click', send);
input.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send(); });
document.getElementById('dashLink').addEventListener('click', () => vscode.postMessage({ type: 'openDashboard' }));

window.addEventListener('message', e => {
  const msg = e.data;

  if (msg.type === 'missionCreated' && msg.mission) {
    const id = msg.mission.id;
    const el = addMsg('msg-running',
      '<div class="msg-title"><span class="status-dot" style="background:#f0ad4e;"></span>' + esc(msg.mission.title) + '</div>' +
      '<div class="msg-meta" id="meta-' + esc(id) + '">Building…</div>' +
      '<span class="link" data-id="' + esc(id) + '">Open in dashboard ↗</span>'
    );
    el.querySelector('[data-id]')?.addEventListener('click', () => vscode.postMessage({ type: 'openMission', missionId: id }));
    el.id = 'mission-' + id;

    // Start polling
    polling[id] = setInterval(() => vscode.postMessage({ type: 'pollStatus', missionId: id }), 4000);
  }

  if (msg.type === 'statusUpdate' && msg.missionId) {
    const el = document.getElementById('mission-' + msg.missionId);
    const meta = document.getElementById('meta-' + msg.missionId);
    if (meta) meta.textContent = statusLabel(msg.status);
    if (el) {
      const dot = el.querySelector('.status-dot');
      if (dot) dot.style.background = statusColor(msg.status);
      const done = ['verified','completed_with_risks','changes_requested','build_failed','verification_failed','cancelled'];
      if (done.includes(msg.status)) {
        el.className = 'msg msg-mission';
        clearInterval(polling[msg.missionId]);
        delete polling[msg.missionId];
      }
    }
  }

  if (msg.type === 'error') {
    addMsg('msg-error', 'Error: ' + esc(msg.message));
  }
});
</script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
