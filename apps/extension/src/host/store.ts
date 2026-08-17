import { promises as fs } from "node:fs";
import path from "node:path";
import type { ModuleKind, ModuleSpec, ProjectDiscovery, ProjectGraph } from "@march/spec-schema";
import { uniqueSlug } from "./slug.js";

const MARCH_DIR = ".march";

export interface ProjectFile {
  version: "1.0";
  name: string;
  description: string;
  /** Path to this project's coding agent CLI binary -- see MarchStore.getOrCreateProject's defaulting for backward compat. */
  agentBin: string;
}

export interface ModuleFile {
  name: string;
  description: string;
  /** Backend or frontend -- determines which node vocabulary/language list/generation prompt applies. */
  kind: ModuleKind;
  language: string;
  createdAt: string;
  /** Where this module's generated/discovered code lives, relative to the workspace root. */
  codePath: string;
}

export type ModuleSummary = ModuleFile & { slug: string };

export interface DiagramFile {
  tldrawSnapshot: unknown;
  specJson: ModuleSpec;
}

export interface RootDiagramFile {
  tldrawSnapshot: unknown;
  graphJson: ProjectGraph;
}

function emptyDiagram(name: string, description: string): DiagramFile {
  return {
    tldrawSnapshot: {},
    specJson: { version: "1.0", module: { name, description }, nodes: [], edges: [] },
  };
}

/**
 * All March project data for one VS Code workspace lives under `<root>/.march/`
 * as plain JSON -- no DB, git-diffable. A module's identity is its folder
 * name; there's no separate id, since the workspace root is already the one
 * project this store manages.
 */
export class MarchStore {
  constructor(private readonly workspaceRoot: string) {}

  private get marchDir() {
    return path.join(this.workspaceRoot, MARCH_DIR);
  }
  private get modulesDir() {
    return path.join(this.marchDir, "modules");
  }
  get jobsDir() {
    return path.join(this.marchDir, "jobs");
  }
  private moduleDir(slug: string) {
    return path.join(this.modulesDir, slug);
  }

  /** Absolute path to a module's diagram.json -- used to point the generation prompt at it directly. */
  diagramFilePath(slug: string): string {
    return path.join(this.moduleDir(slug), "diagram.json");
  }

  /** Reads module.json, defaulting `kind` to "backend" for modules created before that field existed. */
  private async readModuleFile(slug: string): Promise<ModuleFile | null> {
    const meta = await this.readJson<Omit<ModuleFile, "kind"> & { kind?: ModuleKind }>(
      path.join(this.moduleDir(slug), "module.json"),
    );
    if (!meta) return null;
    return { ...meta, kind: meta.kind ?? "backend" };
  }

  async ensureInit(): Promise<void> {
    await fs.mkdir(this.modulesDir, { recursive: true });
    await fs.mkdir(this.jobsDir, { recursive: true });
    await this.getOrCreateProject();
  }

  /**
   * Defaults `agentBin` to "" for project.json files written before that
   * field existed -- no built-in assumption of which CLI agent a project
   * uses; resolveAgentBin's "Locate binary..." prompt (see config.ts)
   * handles an empty/not-found value the same way either way, so this
   * degrades gracefully rather than needing a real default.
   */
  async getOrCreateProject(): Promise<ProjectFile> {
    const file = path.join(this.marchDir, "project.json");
    const existing = await this.readJson<Omit<ProjectFile, "agentBin"> & { agentBin?: string }>(file);
    if (existing) return { ...existing, agentBin: existing.agentBin ?? "" };
    const project: ProjectFile = {
      version: "1.0",
      name: path.basename(this.workspaceRoot),
      description: "",
      agentBin: "",
    };
    await this.writeJson(file, project);
    return project;
  }

  async updateProject(patch: Partial<Pick<ProjectFile, "description" | "name" | "agentBin">>): Promise<ProjectFile> {
    const current = await this.getOrCreateProject();
    const next = { ...current, ...patch };
    await this.writeJson(path.join(this.marchDir, "project.json"), next);
    return next;
  }

  async getRootDiagram(): Promise<RootDiagramFile> {
    const file = path.join(this.marchDir, "root-diagram.json");
    const existing = await this.readJson<RootDiagramFile>(file);
    if (existing) return existing;
    const empty: RootDiagramFile = { tldrawSnapshot: {}, graphJson: { version: "1.0", nodes: [], edges: [] } };
    await this.writeJson(file, empty);
    return empty;
  }

  async saveRootDiagram(data: RootDiagramFile): Promise<void> {
    await this.writeJson(path.join(this.marchDir, "root-diagram.json"), data);
  }

  async listModules(): Promise<ModuleSummary[]> {
    const entries = await fs.readdir(this.modulesDir, { withFileTypes: true }).catch(() => []);
    const modules: ModuleSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const meta = await this.readModuleFile(entry.name);
      if (meta) modules.push({ slug: entry.name, ...meta });
    }
    modules.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return modules;
  }

  private async dirExists(dir: string): Promise<boolean> {
    const stat = await fs.stat(dir).catch(() => null);
    return stat !== null && stat.isDirectory();
  }

  async createModule(input: { name: string; description: string; kind: ModuleKind; language: string }): Promise<ModuleSummary> {
    const slug = await uniqueSlug(input.name, (candidate) => this.dirExists(this.moduleDir(candidate)));
    const meta: ModuleFile = {
      name: input.name,
      description: input.description,
      kind: input.kind,
      language: input.language,
      createdAt: new Date().toISOString(),
      // New modules generate into a same-named top-level folder by default.
      codePath: slug,
    };
    await fs.mkdir(this.moduleDir(slug), { recursive: true });
    await this.writeJson(path.join(this.moduleDir(slug), "module.json"), meta);
    await this.writeJson(
      path.join(this.moduleDir(slug), "diagram.json"),
      emptyDiagram(input.name, input.description),
    );
    return { slug, ...meta };
  }

  /**
   * Seeds a new module from a whole-project autodiscovery result's per-module
   * spec (mirrors createModule, minus the empty diagram). `codePath` is the
   * directory that was actually explored, so a later "Generate" for this
   * module targets the same code it was discovered from, not a fresh folder.
   */
  async createModuleFromSpec(spec: ModuleSpec, kind: ModuleKind, language: string, codePath: string): Promise<ModuleSummary> {
    const slug = await uniqueSlug(spec.module.name, (candidate) => this.dirExists(this.moduleDir(candidate)));
    const meta: ModuleFile = {
      name: spec.module.name,
      description: spec.module.description || "",
      kind,
      language,
      createdAt: new Date().toISOString(),
      codePath,
    };
    await fs.mkdir(this.moduleDir(slug), { recursive: true });
    await this.writeJson(path.join(this.moduleDir(slug), "module.json"), meta);
    await this.writeJson(path.join(this.moduleDir(slug), "diagram.json"), { tldrawSnapshot: {}, specJson: spec });
    return { slug, ...meta };
  }

  /**
   * Creates one module per entry in a whole-workspace autodiscovery result,
   * then merges corresponding nodes/edges into the root graph (module-name
   * edges get resolved to the freshly assigned slugs). Never touches the
   * existing tldrawSnapshot -- if the root canvas already has manual content,
   * the newly created modules still show up via the "auto-create missing
   * module" logic the webview already runs on mount; only a from-empty root
   * canvas will render the discovered edges too (see projectGraphImport.ts).
   */
  async createProjectFromDiscovery(discovery: ProjectDiscovery): Promise<ModuleSummary[]> {
    const nameToSlug = new Map<string, string>();
    const created: ModuleSummary[] = [];
    for (const mod of discovery.modules) {
      const summary = await this.createModuleFromSpec(mod.spec, mod.kind, mod.language, mod.codePath);
      nameToSlug.set(mod.spec.module.name, summary.slug);
      created.push(summary);
    }

    const current = await this.getRootDiagram();
    const existingNodeIds = new Set(current.graphJson.nodes.map((n) => n.id));
    const startIndex = current.graphJson.nodes.length;
    const newNodes = created
      .filter((m) => !existingNodeIds.has(m.slug))
      .map((m, i) => ({
        id: m.slug,
        moduleId: m.slug,
        position: { x: ((startIndex + i) % 4) * 260, y: Math.floor((startIndex + i) / 4) * 140 },
      }));

    const newEdges = discovery.edges.flatMap((e, i) => {
      const source = nameToSlug.get(e.source);
      const target = nameToSlug.get(e.target);
      if (!source || !target) return [];
      return [{ id: `discovered-${source}-${target}-${i}`, source, target, label: e.label }];
    });

    await this.saveRootDiagram({
      tldrawSnapshot: current.tldrawSnapshot,
      graphJson: {
        version: "1.0",
        nodes: [...current.graphJson.nodes, ...newNodes],
        edges: [...current.graphJson.edges, ...newEdges],
      },
    });

    return created;
  }

  /** Absolute path to a module's code directory, creating it if it doesn't exist yet. */
  async ensureCodeDir(slug: string): Promise<string> {
    const meta = await this.readModuleFile(slug);
    if (!meta) throw new Error(`Module "${slug}" not found`);
    const dir = path.resolve(this.workspaceRoot, meta.codePath);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  async getModule(slug: string): Promise<(ModuleSummary & { diagram: DiagramFile }) | null> {
    const meta = await this.readModuleFile(slug);
    if (!meta) return null;
    const diagram =
      (await this.readJson<DiagramFile>(path.join(this.moduleDir(slug), "diagram.json"))) ??
      emptyDiagram(meta.name, meta.description);
    return { slug, ...meta, diagram };
  }

  /**
   * Removes a module's March data (folder under modules/, plus any node/edge
   * referencing it on the root graph). Deliberately leaves the generated
   * code at its `codePath` untouched -- deleting a module's diagram is not
   * consent to delete real source files sitting in the workspace.
   */
  async deleteModule(slug: string): Promise<void> {
    await fs.rm(this.moduleDir(slug), { recursive: true, force: true });

    const current = await this.getRootDiagram();
    const removedNodeIds = new Set(
      current.graphJson.nodes.filter((n) => n.moduleId === slug).map((n) => n.id),
    );
    if (removedNodeIds.size === 0) return;

    await this.saveRootDiagram({
      tldrawSnapshot: current.tldrawSnapshot,
      graphJson: {
        version: "1.0",
        nodes: current.graphJson.nodes.filter((n) => !removedNodeIds.has(n.id)),
        edges: current.graphJson.edges.filter(
          (e) => !removedNodeIds.has(e.source) && !removedNodeIds.has(e.target),
        ),
      },
    });
  }

  async updateModule(
    slug: string,
    patch: Partial<Pick<ModuleFile, "language" | "description" | "name">>,
  ): Promise<ModuleSummary> {
    const current = await this.readModuleFile(slug);
    if (!current) throw new Error(`Module "${slug}" not found`);
    const next = { ...current, ...patch };
    await this.writeJson(path.join(this.moduleDir(slug), "module.json"), next);
    return { slug, ...next };
  }

  async saveDiagram(slug: string, data: DiagramFile): Promise<void> {
    if (!(await this.dirExists(this.moduleDir(slug)))) {
      throw new Error(`Module "${slug}" not found`);
    }
    await this.writeJson(path.join(this.moduleDir(slug), "diagram.json"), data);
  }

  private async readJson<T>(file: string): Promise<T | null> {
    const raw = await fs.readFile(file, "utf8").catch(() => null);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  private async writeJson(file: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2));
  }
}
