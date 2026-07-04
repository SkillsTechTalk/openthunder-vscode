import * as vscode from 'vscode';

// "Current Change / Can I Ship" panel. A THIN VISUAL RELAY: the extension host fetches
// the verdict the local OpenThunder engine already computed (POST /api/review-diff) and
// the webview just renders it. No analysis happens here; the engine stays on localhost.
// Extension-side fetch avoids webview CSP/CORS; the webview only renders received data.

function getNonce(): string {
  let t = '';
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) t += c.charAt(Math.floor(Math.random() * c.length));
  return t;
}

interface Verdict {
  empty?: boolean;
  scope?: string;
  risk?: string;
  changedFiles?: unknown[];
  blastRadius?: unknown[];
  shipDecision?: { verdict?: string; headline?: string; blockers?: string[]; cautions?: string[] };
  error?: string;
}

export class CurrentChangeViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  constructor(private readonly serverUrl: () => string) {}

  public refresh() { void this.load(); }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((msg: { type: string }) => {
      if (msg.type === 'recheck') void this.load();
      if (msg.type === 'openDashboard') {
        void vscode.commands.executeCommand('openthunder.openDashboard');
      }
      if (msg.type === 'start') {
        // Launch the desktop app (the engine) via its registered URL scheme, then
        // re-check a few times as it comes up.
        void vscode.env.openExternal(vscode.Uri.parse('openthunder://open'));
        let tries = 0;
        const t = setInterval(() => { tries++; void this.load(); if (tries >= 6) clearInterval(t); }, 2500);
      }
    });
    void this.load();
  }

  private async load() {
    if (!this.view) return;
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    try {
      const r = await fetch(`${this.serverUrl()}/api/review-diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: folder }),
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) { this.post({ error: 'server' }); return; }
      this.post(await r.json() as Verdict);
    } catch {
      this.post({ error: 'offline' });
    }
  }

  private post(data: Verdict) { this.view?.webview.postMessage({ type: 'verdict', data }); }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    // Inner script uses string concatenation (no template literals) so nothing collides
    // with this TS template's ${} interpolation, and no inline event handlers (CSP-safe).
    return [
      '<!doctype html><html><head><meta charset="utf-8">',
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">`,
      '<style>',
      'body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:10px;font-size:12.5px}',
      '.muted{color:var(--vscode-descriptionForeground);line-height:1.5}',
      '.verdict{display:inline-block;padding:3px 10px;border-radius:6px;font-weight:700;font-size:11.5px;letter-spacing:.5px;margin-bottom:6px}',
      '.ship{background:rgba(52,211,153,.18);color:#34d399}.caution{background:rgba(245,158,11,.18);color:#f59e0b}.hold{background:rgba(239,68,68,.18);color:#f87171}',
      '.headline{margin:2px 0 12px;font-weight:600}',
      '.row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--vscode-panel-border)}',
      '.sec{margin:12px 0 4px;font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;color:var(--vscode-descriptionForeground)}',
      '.item{padding:5px 8px;border-radius:5px;margin:3px 0}.block{background:rgba(239,68,68,.12)}.caut{background:rgba(245,158,11,.12)}',
      'button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;padding:5px 12px;border-radius:5px;cursor:pointer;margin-top:12px;margin-right:6px}',
      'button.sec-btn{background:transparent;color:var(--vscode-foreground);border:1px solid var(--vscode-panel-border)}',
      '</style></head><body><div id="root" class="muted">Checking your changes…</div>',
      `<script nonce="${nonce}">`,
      "const vscode=acquireVsCodeApi();const root=document.getElementById('root');",
      "function esc(s){var d=document.createElement('div');d.textContent=String(s==null?'':s);return d.innerHTML;}",
      "function btn(id,label,sec){return '<button id=\"'+id+'\"'+(sec?' class=\"sec-btn\"':'')+'>'+esc(label)+'</button>';}",
      "function wire(){var rc=document.getElementById('rc');if(rc)rc.onclick=function(){root.className='muted';root.textContent='Checking…';vscode.postMessage({type:'recheck'});};var f=document.getElementById('full');if(f)f.onclick=function(){vscode.postMessage({type:'openDashboard'});};var s=document.getElementById('start');if(s)s.onclick=function(){root.className='muted';root.textContent='Starting OpenThunder…';vscode.postMessage({type:'start'});};}",
      "function render(d){",
      "  if(d.error){root.innerHTML='<div class=\"muted\">OpenThunder isn\\'t running yet. Start it and this panel fills in.</div>'+btn('start','Start OpenThunder')+btn('rc','Re-check',true);wire();return;}",
      "  if(d.empty){root.innerHTML='<div class=\"muted\">No uncommitted changes to verify. Make a change, then re-check.</div>'+btn('rc','Re-check');wire();return;}",
      "  var sd=d.shipDecision||{};var v=(sd.verdict||'').toLowerCase();var cls=v.indexOf('ship')>=0?'ship':(v.indexOf('hold')>=0||v.indexOf('block')>=0)?'hold':'caution';",
      "  var h='<div class=\"verdict '+cls+'\">'+esc((sd.verdict||'review').toUpperCase())+'</div>';",
      "  h+='<div class=\"headline\">'+esc(sd.headline||'')+'</div>';",
      "  h+='<div class=\"row\"><span>Risk</span><b>'+esc(d.risk||'-')+'</b></div>';",
      "  h+='<div class=\"row\"><span>Changed files</span><b>'+((d.changedFiles||[]).length)+'</b></div>';",
      "  h+='<div class=\"row\"><span>Blast radius</span><b>'+((d.blastRadius||[]).length)+' area(s)</b></div>';",
      "  var bl=sd.blockers||[];if(bl.length){h+='<div class=\"sec\">Blockers</div>';bl.forEach(function(b){h+='<div class=\"item block\">'+esc(b)+'</div>';});}",
      "  var ca=sd.cautions||[];if(ca.length){h+='<div class=\"sec\">Cautions</div>';ca.forEach(function(c){h+='<div class=\"item caut\">'+esc(c)+'</div>';});}",
      "  h+='<div>'+btn('rc','Re-check')+btn('full','Open full report',true)+'</div>';",
      "  root.className='';root.innerHTML=h;wire();",
      "}",
      "window.addEventListener('message',function(e){if(e.data&&e.data.type==='verdict')render(e.data.data);});",
      '</script></body></html>',
    ].join('\n');
  }
}
