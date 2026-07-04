import * as vscode from 'vscode';

const TRIGGER_CHARS = ['(', '.', ' ', '\n'];
const MIN_PREFIX_LENGTH = 3;

export function registerCompletionProvider(
  context: vscode.ExtensionContext,
  serverUrl: () => string,
  provider: () => string,
): vscode.Disposable {
  return vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    new OpenThunderInlineProvider(serverUrl, provider),
  );
}

class OpenThunderInlineProvider implements vscode.InlineCompletionItemProvider {
  private lastRequestId = 0;

  constructor(
    private readonly serverUrl: () => string,
    private readonly provider: () => string,
  ) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionList | null> {
    const cfg = vscode.workspace.getConfiguration('openthunder');
    if (!cfg.get<boolean>('completionsEnabled', true)) return null;

    const prefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    const lastLine = prefix.split('\n').pop() ?? '';
    if (lastLine.trim().length < MIN_PREFIX_LENGTH) return null;

    // Suffix: next 500 chars for FIM context
    const docEnd  = document.lineAt(document.lineCount - 1).range.end;
    const suffix  = document.getText(new vscode.Range(position, docEnd)).substring(0, 500);

    const requestId = ++this.lastRequestId;

    try {
      const res = await fetch(`${this.serverUrl()}/api/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: token.isCancellationRequested ? AbortSignal.abort() : AbortSignal.timeout(8000),
        body: JSON.stringify({
          prefix,
          suffix,
          filepath: document.fileName,
          provider: this.provider(),
        }),
      });

      if (token.isCancellationRequested || requestId !== this.lastRequestId) return null;
      if (!res.ok) return null;

      const d = await res.json() as { completion?: string };
      const completion = d.completion?.trim();
      if (!completion) return null;

      return {
        items: [
          new vscode.InlineCompletionItem(
            completion,
            new vscode.Range(position, position),
          ),
        ],
      };
    } catch {
      return null;
    }
  }
}
