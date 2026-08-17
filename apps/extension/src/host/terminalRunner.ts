import * as vscode from "vscode";

/**
 * Opens a real, visible terminal running `agentBin` interactively -- no
 * flags that bypass its own permission system -- and hands it a one-line
 * instruction to go read `promptFile` -- rather than trying to
 * paste the (multi-paragraph, multi-KB) prompt text itself into the pty,
 * whose embedded newlines would otherwise be interpreted as Enter
 * keypresses and submit it line by line. Because this is a real interactive
 * session, the agent's own permission prompts (if it has them) work
 * normally and the user can watch/intervene exactly as if they'd typed it
 * themselves. There is no way to know when an open-ended REPL session is
 * "done" -- this is a hand-off, not a job the extension tracks to
 * completion. Works with any CLI agent that opens into an interactive chat
 * when run with no arguments and can read a file when told to (the exact
 * binary is per-project, see MarchStore's `agentBin`).
 *
 * Both Generate and Autodiscover use this same hand-off -- Autodiscover
 * has to know when the agent is actually done (it needs to read the file
 * back and act on it), but it gets that by polling for the output file to
 * appear (see messageRouter.ts's waitForFile) rather than by tracking this
 * terminal's process in any way.
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
