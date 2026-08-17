import * as vscode from "vscode";
import { createOrRevealMarchPanel, disposeMarchPanel } from "./webviewPanel.js";

/**
 * Backs the activity bar view -- its only job is to immediately hand off to
 * the real webview panel (which needs the full editor area for the canvas,
 * not a cramped sidebar) and then get out of the way. Without the
 * closeSidebar call, clicking the March icon would leave a near-empty
 * "Open March" view sitting in the sidebar alongside the panel it just
 * opened, which reads as broken rather than as a launcher.
 */
class MarchViewLauncher implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: false, enableCommandUris: true };
    webviewView.webview.html = `<!doctype html>
<html>
  <body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:var(--vscode-font-family);color:var(--vscode-foreground);">
    <a href="command:march.open" style="color:var(--vscode-textLink-foreground);">Open March</a>
  </body>
</html>`;
    createOrRevealMarchPanel(this.context);
    void vscode.commands.executeCommand("workbench.action.closeSidebar");
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("march.open", () => {
      createOrRevealMarchPanel(context);
    }),
    vscode.window.registerWebviewViewProvider("march.launcher", new MarchViewLauncher(context)),
  );
}

export function deactivate() {
  disposeMarchPanel();
}
