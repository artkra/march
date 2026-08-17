import * as vscode from "vscode";
import { spawn } from "node:child_process";

/** Path to the coding agent's CLI binary -- "claude" by default, but any CLI-based agent works. */
export function getAgentBin(): string {
  return vscode.workspace.getConfiguration("march").get<string>("agentBin", "claude");
}

/** Flags for the one-shot, non-interactive run Autodiscover needs (see terminalRunner.ts's runTracked). */
export function getAgentArgs(): string[] {
  return vscode.workspace
    .getConfiguration("march")
    .get<string[]>("agentArgs", ["-p", "--dangerously-skip-permissions", "--output-format", "text", "--verbose"]);
}

/** Sets `march.agentBin` directly, for the in-webview agent picker (see NavPanel.tsx). */
export async function setAgentBin(bin: string): Promise<void> {
  await vscode.workspace.getConfiguration("march").update("agentBin", bin, vscode.ConfigurationTarget.Global);
}

function binWorks(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawnThroughLoginShell(bin, ["--version"]);
      child.on("error", () => resolve(false));
      child.on("exit", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

/**
 * Runs a command through the user's own login shell rather than spawning it
 * directly. VS Code (and the extension host process it launches) is usually
 * started from a GUI launcher/dock, not a terminal, so on macOS/Linux it
 * doesn't inherit PATH entries added by .zshrc/.bashrc/nvm/asdf/etc -- a
 * direct `spawn("claude", ...)` can report "not found" even though `claude
 * --version` works fine when you type it yourself. `-ilc` (interactive
 * login) sources the same profile files a real terminal would, matching
 * what actually happens when a generated VS Code *terminal* runs the same
 * binary (which is why only this pre-flight check needed the fix, not
 * terminalRunner.ts's terminals).
 */
function spawnThroughLoginShell(bin: string, args: string[]) {
  if (process.platform === "win32") {
    return spawn(bin, args, { stdio: "ignore" });
  }
  const shell = process.env.SHELL || "/bin/bash";
  const commandLine = [bin, ...args].map((a) => `"${a}"`).join(" ");
  return spawn(shell, ["-ilc", commandLine], { stdio: "ignore" });
}

/**
 * Returns a working path to the agent CLI, prompting the user to locate it
 * if the configured/default binary can't be found or run -- rather than
 * silently spawning a terminal that just prints "command not found" with no
 * further explanation. Returns undefined if the user cancels.
 */
export async function resolveAgentBin(): Promise<string | undefined> {
  const configured = getAgentBin();
  if (await binWorks(configured)) return configured;

  const choice = await vscode.window.showErrorMessage(
    `March: couldn't run "${configured}" -- is your coding agent CLI installed and on your PATH? ` +
      `(Configured via the "march.agentBin" setting; defaults to the Claude Code CLI.)`,
    "Locate binary...",
    "Cancel",
  );
  if (choice !== "Locate binary...") return undefined;

  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    title: "Select your coding agent's CLI binary",
  });
  const binPath = picked?.[0]?.fsPath;
  if (!binPath) return undefined;

  if (!(await binWorks(binPath))) {
    void vscode.window.showErrorMessage(`March: "${binPath}" doesn't look like a working CLI binary.`);
    return undefined;
  }

  await vscode.workspace.getConfiguration("march").update("agentBin", binPath, vscode.ConfigurationTarget.Global);
  return binPath;
}
