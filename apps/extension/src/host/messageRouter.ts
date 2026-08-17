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
import { getAgentArgs, resolveAgentBin } from "./config.js";
import { runInteractive, runTracked } from "./terminalRunner.js";
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

      const args = getAgentArgs();
      if (args.length === 0) {
        throw new Error(
          'Autodiscover needs non-interactive flags for your agent CLI, set via the "march.agentArgs" VS Code ' +
            "setting -- these vary per agent (e.g. a print/non-interactive flag, an output format), so there's " +
            "no default that works across all of them. Check your agent's own CLI docs for its non-interactive mode.",
        );
      }

      const runId = newRunId();
      await fs.mkdir(store.jobsDir, { recursive: true });
      const promptFile = path.join(store.jobsDir, `${runId}-autodiscover-prompt.txt`);
      const outputPath = path.join(store.jobsDir, `${runId}-autodiscover-output.json`);
      await fs.writeFile(promptFile, buildAutodiscoverProjectPrompt(outputPath));

      const result = await runTracked({
        agentBin,
        args,
        cwd: workspaceRoot,
        title: "March: Autodiscover",
        stdinFile: promptFile,
      });

      if (result.timedOut) {
        throw new Error(
          "Autodiscovery is running in the terminal, but March couldn't detect a shell integration " +
            "signal to know when it finishes (this needs bash/zsh/fish/pwsh). Watch the terminal, and once " +
            "it's done, reopen this and try Autodiscover again -- or ask in a follow-up if you'd like a " +
            'manual "import last discovery result" action instead.',
        );
      }
      if (result.exitCode !== 0) {
        throw new Error(`Autodiscovery exited with code ${result.exitCode}. Check the "March: Autodiscover" terminal.`);
      }

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
