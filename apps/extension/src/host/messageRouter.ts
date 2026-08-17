import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  languagesForKind,
  MODULE_KINDS,
  parseModuleSpec,
  safeParseModuleSpec,
  safeParseProjectDiscovery,
  safeParseProjectGraph,
  type BackendLanguageId,
  type FrontendLanguageId,
  type LanguageId,
  type MarchRequest,
  type ModuleKind,
} from "@march/spec-schema";
import { MarchStore } from "./store.js";
import { resolveAgentBin } from "./config.js";
import { runInteractive } from "./terminalRunner.js";
import {
  buildAutodiscoverProjectPrompt,
  buildBackendGeneratePrompt,
  buildFrontendGeneratePrompt,
  type GenerateContext,
} from "./prompts.js";

function requireKind(kind: unknown): ModuleKind {
  if (typeof kind !== "string" || !(MODULE_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`kind must be one of: ${MODULE_KINDS.join(", ")}`);
  }
  return kind as ModuleKind;
}

function requireLanguage(kind: ModuleKind, language: unknown): LanguageId {
  const valid = languagesForKind(kind);
  if (typeof language !== "string" || !valid.some((l) => l.id === language)) {
    throw new Error(`language must be one of: ${valid.map((l) => l.id).join(", ")} (for a ${kind} module)`);
  }
  return language as LanguageId;
}

function newRunId(): string {
  return crypto.randomBytes(8).toString("hex");
}

/**
 * Polls for a file to appear rather than tracking a process exit code --
 * Autodiscover hands off to a fully interactive terminal (see runInteractive)
 * with no completion signal at all, so this is the only way to know when the
 * agent is done: it's finished writing the one file it was told to produce.
 * The 30-minute cap is just a safety net against an abandoned/stuck session
 * leaving the RPC call (and the webview's "Discovering..." state) hanging
 * forever, not a real expectation of how long this should take.
 */
function waitForFile(filePath: string, timeoutMs = 30 * 60 * 1000, pollIntervalMs = 2000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      fs.stat(filePath).then(
        () => resolve(),
        () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Timed out after ${Math.round(timeoutMs / 60000)} minutes waiting for ${filePath}`));
            return;
          }
          setTimeout(check, pollIntervalMs);
        },
      );
    };
    check();
  });
}

/**
 * Handles one RPC request from the webview. Mirrors what the old Express
 * routes did, just against MarchStore's files instead of Prisma, and
 * returning a plain value instead of calling `res.json(...)`. Throws on
 * error -- the webview panel wraps this and turns it into `{ok:false,error}`.
 */
export async function handleRequest(store: MarchStore, workspaceRoot: string, request: MarchRequest): Promise<unknown> {
  switch (request.type) {
    case "getProject":
      return store.getOrCreateProject();

    case "updateProject": {
      const patch: { description?: string; agentBin?: string } = { description: request.description };
      if (request.agentBin !== undefined) {
        const agentBin = request.agentBin.trim();
        if (!agentBin) throw new Error("agentBin cannot be empty");
        patch.agentBin = agentBin;
      }
      return store.updateProject(patch);
    }

    case "listModules":
      return store.listModules();

    case "createModule": {
      const name = request.name.trim();
      if (!name) throw new Error("name is required");
      const kind = requireKind(request.kind);
      const language = requireLanguage(kind, request.language);
      return store.createModule({ name, description: request.description ?? "", kind, language });
    }

    case "getModule": {
      const module = await store.getModule(request.slug);
      if (!module) throw new Error(`Module "${request.slug}" not found`);
      return module;
    }

    case "updateModule": {
      const module = await store.getModule(request.slug);
      if (!module) throw new Error(`Module "${request.slug}" not found`);
      return store.updateModule(request.slug, { language: requireLanguage(module.kind, request.language) });
    }

    case "deleteModule": {
      const module = await store.getModule(request.slug);
      if (!module) throw new Error(`Module "${request.slug}" not found`);
      await store.deleteModule(request.slug);
      return {};
    }

    case "saveDiagram": {
      const parsed = safeParseModuleSpec(request.specJson);
      if (!parsed.success) {
        throw new Error(`specJson is invalid: ${parsed.error.message}`);
      }
      const data = { tldrawSnapshot: request.tldrawSnapshot, specJson: parsed.data };
      await store.saveDiagram(request.slug, data);
      return data;
    }

    case "getRootDiagram":
      return store.getRootDiagram();

    case "saveRootDiagram": {
      const parsed = safeParseProjectGraph(request.graphJson);
      if (!parsed.success) {
        throw new Error(`graphJson is invalid: ${parsed.error.message}`);
      }
      const data = { tldrawSnapshot: request.tldrawSnapshot, graphJson: parsed.data };
      await store.saveRootDiagram(data);
      return data;
    }

    case "generate": {
      const module = await store.getModule(request.slug);
      if (!module) throw new Error(`Module "${request.slug}" not found`);
      const agentBin = await resolveAgentBin(store);
      if (!agentBin) return {};

      const spec = parseModuleSpec(module.diagram.specJson);
      const cwd = await store.ensureCodeDir(request.slug);
      const promptFile = path.join(store.jobsDir, `${newRunId()}-generate-${request.slug}-prompt.txt`);
      await fs.mkdir(store.jobsDir, { recursive: true });

      const project = await store.getOrCreateProject();
      const ctx: GenerateContext = {
        project: { name: project.name, description: project.description },
        diagramFilePath: store.diagramFilePath(request.slug),
        workspaceReadmePath: path.join(workspaceRoot, "README.md"),
      };
      const prompt =
        module.kind === "frontend"
          ? buildFrontendGeneratePrompt(spec, module.language as FrontendLanguageId, ctx)
          : buildBackendGeneratePrompt(spec, module.language as BackendLanguageId, ctx);
      await fs.writeFile(promptFile, prompt);

      runInteractive({ agentBin, cwd, title: `March: Generate "${module.name}"`, promptFile });
      return {};
    }

    case "autodiscoverProject": {
      const agentBin = await resolveAgentBin(store);
      if (!agentBin) return {};

      const runId = newRunId();
      await fs.mkdir(store.jobsDir, { recursive: true });
      const promptFile = path.join(store.jobsDir, `${runId}-autodiscover-prompt.txt`);
      const outputPath = path.join(store.jobsDir, `${runId}-autodiscover-output.json`);
      await fs.writeFile(promptFile, buildAutodiscoverProjectPrompt(outputPath));

      runInteractive({ agentBin, cwd: workspaceRoot, title: "March: Autodiscover", promptFile });

      await waitForFile(outputPath);
      // Small settle delay -- the file existing doesn't guarantee the
      // write that created it has been fully flushed yet.
      await new Promise((r) => setTimeout(r, 500));

      const raw = await fs.readFile(outputPath, "utf8").catch(() => null);
      if (!raw) {
        throw new Error(`Autodiscovery finished but ${outputPath} was not written.`);
      }
      const parsed = safeParseProjectDiscovery(JSON.parse(raw));
      if (!parsed.success) {
        throw new Error(`Discovered project did not match the expected shape: ${parsed.error.message}`);
      }
      await store.createProjectFromDiscovery(parsed.data);
      await fs.unlink(outputPath).catch(() => {});
      return {};
    }
  }
}
