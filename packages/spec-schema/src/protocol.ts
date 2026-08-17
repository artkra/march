import type { LanguageId, ModuleKind, ModuleSpec, ProjectGraph } from "./schema.js";

// The RPC protocol between the webview (React app) and the VS Code extension
// host. There is no HTTP server -- the webview posts a request, the host
// posts back a matching response (correlated by `id`). "generate" and
// "autodiscoverProject" run the agent in a real VS Code terminal rather than
// a process the host tracks, so there's no job-log push channel here --
// "generate" hands off to an open-ended interactive session the user
// watches directly in the Terminal panel, and "autodiscoverProject" simply
// awaits its own RPC response for as long as the run takes.

export interface ProjectData {
  version: "1.0";
  name: string;
  description: string;
  /** Path to this project's coding agent CLI binary -- lives here, not a VS Code setting, so it travels with the project like everything else in .march/. */
  agentBin: string;
}

export interface ModuleSummary {
  slug: string;
  name: string;
  description: string;
  kind: ModuleKind;
  language: string;
  createdAt: string;
  /** Where this module's generated/discovered code lives, relative to the workspace root. */
  codePath: string;
}

export interface ModuleDetail extends ModuleSummary {
  diagram: DiagramData;
}

export interface DiagramData {
  tldrawSnapshot: unknown;
  specJson: ModuleSpec;
}

export interface RootDiagramData {
  tldrawSnapshot: unknown;
  graphJson: ProjectGraph;
}

export type MarchRequest =
  | { type: "getProject" }
  | { type: "updateProject"; description?: string; agentBin?: string }
  | { type: "listModules" }
  | { type: "createModule"; name: string; description?: string; kind: ModuleKind; language: LanguageId }
  | { type: "getModule"; slug: string }
  | { type: "updateModule"; slug: string; language: LanguageId }
  | { type: "deleteModule"; slug: string }
  | { type: "saveDiagram"; slug: string; tldrawSnapshot: unknown; specJson: ModuleSpec }
  | { type: "getRootDiagram" }
  | { type: "saveRootDiagram"; tldrawSnapshot: unknown; graphJson: ProjectGraph }
  | { type: "generate"; slug: string }
  | { type: "autodiscoverProject" };

export type MarchRequestType = MarchRequest["type"];

export interface RpcRequestMessage {
  source: "march-webview";
  id: string;
  request: MarchRequest;
}

export type RpcResponseMessage =
  | { source: "march-host"; kind: "response"; id: string; ok: true; data: unknown }
  | { source: "march-host"; kind: "response"; id: string; ok: false; error: string };

export type HostMessage = RpcResponseMessage;
