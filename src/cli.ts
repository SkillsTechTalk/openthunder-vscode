// Offline CLI runner for the OpenThunder extension.
// These helpers shell out to the OpenThunder CLI; no server, no login.

import * as vscode from 'vscode';
import { execFile } from 'child_process';

export interface CliResult {
  ok: boolean;
  /** True when the CLI binary itself was not found (ENOENT). */
  notFound: boolean;
  stdout: string;
  stderr: string;
}

const CLI_TIMEOUT_MS = 120_000;
const CLI_MAX_BUFFER = 32 * 1024 * 1024; // 32 MB; context packs can be large

/**
 * Resolve the configured CLI invocation. The setting is usually a bare binary
 * ("openthunder"), but in dev it may be a command with arguments, e.g.
 * "node /path/to/apps/cli/dist/index.js". We split on whitespace so both work.
 */
function resolveCli(): { command: string; prefixArgs: string[] } {
  const raw = vscode.workspace
    .getConfiguration('openthunder')
    .get<string>('cliPath', 'openthunder')
    .trim() || 'openthunder';
  const parts = raw.split(/\s+/);
  return { command: parts[0], prefixArgs: parts.slice(1) };
}

/** Run an OpenThunder CLI verb in the given working directory. */
export function runCli(verb: string, args: string[], cwd: string): Promise<CliResult> {
  const { command, prefixArgs } = resolveCli();
  return new Promise(resolve => {
    execFile(
      command,
      [...prefixArgs, verb, ...args],
      { cwd, timeout: CLI_TIMEOUT_MS, maxBuffer: CLI_MAX_BUFFER },
      (error, stdout, stderr) => {
        if (error) {
          const notFound = (error as NodeJS.ErrnoException).code === 'ENOENT';
          resolve({
            ok: false,
            notFound,
            stdout: stdout ?? '',
            stderr: (stderr && stderr.trim()) || error.message || 'CLI failed',
          });
          return;
        }
        resolve({ ok: true, notFound: false, stdout, stderr: stderr ?? '' });
      },
    );
  });
}

/** Shared nudge when the CLI binary is missing: funnel to OpenThunder Desktop. */
export function showCliNotFound(): void {
  vscode.window
    .showWarningMessage(
      'OpenThunder CLI not found. Install OpenThunder Desktop or set openthunder.cliPath.',
      'Get OpenThunder',
    )
    .then(action => {
      if (action === 'Get OpenThunder') {
        vscode.env.openExternal(vscode.Uri.parse('https://openthunder.dev'));
      }
    });
}
