import * as vscode from "vscode";

/**
 * Opens a real, visible terminal running `agentBin` interactively (for
 * Claude Code: no -p, no --dangerously-skip-permissions) and hands it a
 * one-line instruction to go read `promptFile` -- rather than trying to
 * paste the (multi-paragraph, multi-KB) prompt text itself into the pty,
 * whose embedded newlines would otherwise be interpreted as Enter
 * keypresses and submit it line by line. Because this is a real interactive
 * session, the agent's own permission prompts (if it has them) work
 * normally and the user can watch/intervene exactly as if they'd typed it
 * themselves. There is no way to know when an open-ended REPL session is
 * "done" -- this is a hand-off, not a job the extension tracks to
 * completion. Works with any CLI agent that opens into an interactive chat
 * when run with no arguments and can read a file when told to, not just
 * Claude Code (see `march.agentBin`).
 */
export function runInteractive(options: { agentBin: string; cwd: string; title: string; promptFile: string }): void {
  const terminal = vscode.window.createTerminal({ name: options.title, cwd: options.cwd });
  terminal.show(false);
  terminal.sendText(options.agentBin, true);
  // Give the CLI a moment to start reading stdin before handing it the
  // instruction -- sent too early it can interleave with its own startup.
  setTimeout(() => {
    terminal.sendText(
      `Read the file at ${options.promptFile} and follow its instructions exactly. Don't ask for confirmation before starting -- proceed once you've read it.`,
      true,
    );
  }, 1500);
}

export interface TrackedRunResult {
  /** Undefined when shell integration never activated -- see `timedOut`. */
  exitCode: number | undefined;
  /** True if the terminal's shell never reported integration in time, so exitCode couldn't be observed. */
  timedOut: boolean;
}

/**
 * Runs one non-interactive command in a visible terminal and resolves once
 * it exits, using VS Code's Shell Integration API for a real exit code --
 * the same deterministic completion signal a hidden child_process gave us,
 * just now observable in the Terminal panel instead of only in our own log
 * drawer. The prompt is piped via shell input redirection (POSIX `< file`,
 * matching how bash/zsh/fish read stdin) rather than passed as an argv
 * entry, for the same reason the old headless runner used stdin: avoiding
 * OS arg-length limits on large prompts.
 *
 * Shell integration (and this exact redirection syntax) needs a POSIX-ish
 * shell -- it won't activate for cmd.exe, and even where it does, Windows
 * users on PowerShell need different redirection syntax than this. When it
 * doesn't activate within the timeout, this falls back to firing the
 * command with no completion signal at all (`timedOut: true`); the caller
 * is responsible for surfacing that clearly rather than assuming success.
 * `args` is the caller's responsibility (see `march.agentArgs`) since
 * different agent CLIs take different non-interactive flags -- this
 * function has no Claude-specific knowledge at all.
 */
export async function runTracked(options: {
  agentBin: string;
  args: string[];
  cwd: string;
  title: string;
  stdinFile: string;
}): Promise<TrackedRunResult> {
  const terminal = vscode.window.createTerminal({ name: options.title, cwd: options.cwd });
  terminal.show(false);

  const shellIntegration = await waitForShellIntegration(terminal, 5000);
  const quotedArgs = options.args.map((a) => `"${a}"`).join(" ");
  const commandLine = `"${options.agentBin}" ${quotedArgs} < "${options.stdinFile}"`;

  if (!shellIntegration) {
    terminal.sendText(commandLine, true);
    return { exitCode: undefined, timedOut: true };
  }

  const execution = shellIntegration.executeCommand(commandLine);
  const exitCode = await new Promise<number | undefined>((resolve) => {
    const sub = vscode.window.onDidEndTerminalShellExecution((e) => {
      if (e.execution === execution) {
        sub.dispose();
        resolve(e.exitCode);
      }
    });
  });
  return { exitCode, timedOut: false };
}

function waitForShellIntegration(
  terminal: vscode.Terminal,
  timeoutMs: number,
): Promise<vscode.TerminalShellIntegration | undefined> {
  if (terminal.shellIntegration) return Promise.resolve(terminal.shellIntegration);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sub.dispose();
      resolve(undefined);
    }, timeoutMs);
    const sub = vscode.window.onDidChangeTerminalShellIntegration((e) => {
      if (e.terminal === terminal) {
        clearTimeout(timer);
        sub.dispose();
        resolve(e.shellIntegration);
      }
    });
  });
}
