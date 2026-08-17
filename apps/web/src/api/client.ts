import type {
  AgentSettings,
  DiagramData,
  HostMessage,
  LanguageId,
  MarchRequest,
  ModuleDetail,
  ModuleKind,
  ModuleSpec,
  ModuleSummary,
  ProjectData,
  ProjectGraph,
  RootDiagramData,
  RpcRequestMessage,
} from "@march/spec-schema";

export type { AgentSettings } from "@march/spec-schema";

export type {
  DiagramData as DiagramRecord,
  ModuleDetail,
  ModuleSummary,
  ProjectData as Project,
  RootDiagramData as RootDiagramRecord,
} from "@march/spec-schema";

const vscode = acquireVsCodeApi();

let counter = 0;
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();

window.addEventListener("message", (e: MessageEvent<HostMessage>) => {
  const msg = e.data;
  if (!msg || msg.source !== "march-host" || msg.kind !== "response") return;
  const entry = pending.get(msg.id);
  if (!entry) return;
  pending.delete(msg.id);
  if (msg.ok) entry.resolve(msg.data);
  else entry.reject(new Error(msg.error));
});

function call<T>(request: MarchRequest): Promise<T> {
  const id = `r${++counter}`;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    const envelope: RpcRequestMessage = { source: "march-webview", id, request };
    vscode.postMessage(envelope);
  });
}

export const api = {
  getProject: () => call<ProjectData>({ type: "getProject" }),
  updateProject: (data: { description?: string }) => call<ProjectData>({ type: "updateProject", ...data }),

  listModules: () => call<ModuleSummary[]>({ type: "listModules" }),
  createModule: (data: { name: string; description?: string; kind: ModuleKind; language: LanguageId }) =>
    call<ModuleSummary>({ type: "createModule", ...data }),

  getModule: (slug: string) => call<ModuleDetail>({ type: "getModule", slug }),
  updateModule: (slug: string, data: { language: LanguageId }) =>
    call<ModuleSummary>({ type: "updateModule", slug, ...data }),
  deleteModule: (slug: string) => call<void>({ type: "deleteModule", slug }),
  saveDiagram: (slug: string, data: { tldrawSnapshot: unknown; specJson: ModuleSpec }) =>
    call<DiagramData>({ type: "saveDiagram", slug, ...data }),

  getRootDiagram: () => call<RootDiagramData>({ type: "getRootDiagram" }),
  saveRootDiagram: (data: { tldrawSnapshot: unknown; graphJson: ProjectGraph }) =>
    call<RootDiagramData>({ type: "saveRootDiagram", ...data }),

  /** Hands off to an interactive terminal session; resolves once it's launched, not once it's done. */
  generate: (slug: string) => call<void>({ type: "generate", slug }),
  /** Awaits the whole run -- may take minutes, same as any other RPC call here, just a slow one. */
  autodiscoverProject: () => call<void>({ type: "autodiscoverProject" }),

  getAgentSettings: () => call<AgentSettings>({ type: "getAgentSettings" }),
  updateAgentBin: (bin: string) => call<AgentSettings>({ type: "updateAgentBin", bin }),
};
