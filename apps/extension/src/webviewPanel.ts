import * as vscode from "vscode";
import crypto from "node:crypto";
import type { HostMessage, RpcRequestMessage } from "@march/spec-schema";
import { MarchStore } from "./host/store.js";
import { handleRequest } from "./host/messageRouter.js";

let currentPanel: vscode.WebviewPanel | undefined;

export function createOrRevealMarchPanel(context: vscode.ExtensionContext) {
  if (currentPanel) {
    currentPanel.reveal();
    return;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("March: open a folder or workspace first.");
    return;
  }
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const store = new MarchStore(workspaceRoot);

  const panel = vscode.window.createWebviewPanel("march", "March", vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
  });

  panel.webview.html = buildHtml(panel.webview, context.extensionUri);

  void store.ensureInit().catch((err) => {
    vscode.window.showErrorMessage(`March: failed to initialize .march/ -- ${String(err)}`);
  });

  panel.webview.onDidReceiveMessage(async (message: RpcRequestMessage) => {
    if (!message || message.source !== "march-webview") return;
    try {
      const data = await handleRequest(store, workspaceRoot, message.request);
      post(panel, { source: "march-host", kind: "response", id: message.id, ok: true, data });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      post(panel, { source: "march-host", kind: "response", id: message.id, ok: false, error });
    }
  });

  panel.onDidDispose(() => {
    currentPanel = undefined;
  });

  currentPanel = panel;
}

function post(panel: vscode.WebviewPanel, message: HostMessage) {
  void panel.webview.postMessage(message);
}

function buildHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const mediaUri = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", file));
  const nonce = crypto.randomBytes(16).toString("base64");
  // tldraw 2.4.6 doesn't bundle its own icons/fonts/translations -- unless
  // given an explicit `assetUrls` override, it fetches them at runtime from
  // tldraw's own CDN. Self-hosting them is the more correct long-term fix
  // (no external network dependency at all -- see README roadmap), but for
  // now the CSP just has to allow that origin or the canvas never loads.
  const tldrawCdn = "https://cdn.tldraw.com";
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} ${tldrawCdn} data:`,
    // React's inline style={{...}} objects render as inline style attributes,
    // which CSP's style-src governs -- 'unsafe-inline' is required for them.
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource} ${tldrawCdn}`,
    `connect-src ${webview.cspSource} ${tldrawCdn}`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${mediaUri("main.css")}" />
    <title>March</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" type="module" src="${mediaUri("main.js")}"></script>
  </body>
</html>`;
}

export function disposeMarchPanel() {
  currentPanel?.dispose();
}
