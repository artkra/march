import type { ModuleSpec, BackendLanguageId, FrontendLanguageId } from "@march/spec-schema";

/**
 * Context every generation prompt needs beyond the module's own spec:
 * the project it belongs to (its Root-canvas description is where
 * cross-cutting instructions like "package everything with Docker Compose"
 * or "this is a pnpm monorepo" live -- see ProjectRootCanvas.tsx's
 * "General project comments/notes" field), and the two files the agent may
 * write back to beyond its own module's code.
 */
export interface GenerateContext {
  project: { name: string; description: string };
  /** Absolute path to this module's own diagram.json, for the small-spec-fixups round-trip below. */
  diagramFilePath: string;
  /** Absolute path to the workspace-root README.md summarizing the whole project. */
  workspaceReadmePath: string;
}

function sharedInstructions(spec: ModuleSpec, ctx: GenerateContext): string {
  return `This module is part of a larger project: "${ctx.project.name}"${ctx.project.description ? ` -- ${ctx.project.description}` : ""}
If that description calls for specific packaging or tooling (e.g. "package
everything with Docker Compose", "this is a pnpm monorepo, add a workspace
entry"), follow it for this module too. Otherwise use your own judgment on
packaging -- don't assume Docker or any specific tooling is wanted unless
the project description says so or the module's own spec implies it.

Also create or update a short README.md at ${ctx.workspaceReadmePath} (the
workspace root, not this module's own directory) summarizing the whole
project and how its modules fit together. Keep it brief. If it already
exists (other modules' generation runs may have added to it), only add or
refresh the section relevant to this module -- don't remove or rewrite
sections that look like they belong to other modules.

If the spec below is missing something small needed to make this module
actually functional (an obviously-implied field, a missing edge, a small
node it needs to make sense), make the smallest reasonable addition --
prefer adding something new over changing a node/edge that's already
drawn, since only additions round-trip cleanly back to the diagram. Reflect
exactly what you added by updating the file at ${ctx.diagramFilePath}: read
it, parse it as JSON, add your new nodes/edges to its "specJson.nodes" /
"specJson.edges" arrays only (new nodes need a unique "id" not already used
and a "position" near whatever they relate to), leave every existing
node/edge you didn't need to touch exactly as it was, and write the whole
object back with its "tldrawSnapshot" key byte-for-byte unchanged. Leave
that file alone entirely if the existing spec is already sufficient --
don't touch it just to reformat or "clean up".

Module: "${spec.module.name}"${spec.module.description ? ` -- ${spec.module.description}` : ""}`;
}

// The decision that actually matters per-module is the programming language;
// framework/ORM/message-queue-client choice within it is left to the agent's
// judgment (per the diagram's own "database"/"queue" nodes for storage/broker
// choice), same as any other "unspecified, agent decides" gap.
const LANGUAGE_INSTRUCTIONS: Record<BackendLanguageId, string> = {
  typescript: [
    "Target language: TypeScript, running on Node.js. Pick a well-established,",
    "idiomatic web framework (e.g. Express or Fastify) and ORM unless the spec's",
    "database/queue nodes imply otherwise.",
  ].join(" "),
  python: [
    "Target language: Python. Pick a well-established, idiomatic web framework",
    "(e.g. FastAPI or Django) and ORM unless the spec's database/queue nodes",
    "imply otherwise.",
  ].join(" "),
  rust: [
    "Target language: Rust. Pick a well-established, idiomatic web framework",
    "(e.g. Axum or Actix-web) and ORM (e.g. Diesel or SQLx) unless the spec's",
    "database/queue nodes imply otherwise.",
  ].join(" "),
  go: [
    "Target language: Go. Pick a well-established, idiomatic web framework",
    "(e.g. Fiber, Gin, or the standard library) and ORM/query builder (e.g.",
    "GORM) unless the spec's database/queue nodes imply otherwise.",
  ].join(" "),
  java: [
    "Target language: Java. Pick a well-established, idiomatic framework (e.g.",
    "Spring Boot) and ORM (e.g. JPA/Hibernate) unless the spec's database/queue",
    "nodes imply otherwise. Use Maven or Gradle for the build.",
  ].join(" "),
  csharp: [
    "Target language: C#, on .NET. Pick a well-established, idiomatic framework",
    "(e.g. ASP.NET Core) and ORM (e.g. Entity Framework Core) unless the spec's",
    "database/queue nodes imply otherwise.",
  ].join(" "),
  ruby: [
    "Target language: Ruby. Pick a well-established, idiomatic framework (e.g.",
    "Rails or Sinatra) and ORM (e.g. ActiveRecord) unless the spec's",
    "database/queue nodes imply otherwise.",
  ].join(" "),
  php: [
    "Target language: PHP. Pick a well-established, idiomatic framework (e.g.",
    "Laravel or Slim) and ORM (e.g. Eloquent or Doctrine) unless the spec's",
    "database/queue nodes imply otherwise.",
  ].join(" "),
};

/** Builds the generation prompt for a backend module, handed to the agent as a file it reads. */
export function buildBackendGeneratePrompt(spec: ModuleSpec, language: BackendLanguageId, ctx: GenerateContext): string {
  const specJson = JSON.stringify(spec, null, 2);
  return `You are generating a backend module's source code from an architecture
spec produced by a visual diagram editor called March. Write a complete,
runnable implementation to the current working directory, with a short
README.md in it explaining how to run it. Do not ask questions -- make
reasonable decisions and proceed.

${LANGUAGE_INSTRUCTIONS[language]}
Whatever framework/ORM you choose, produce a single runnable repo in the
current directory with the language's normal project manifest.

${sharedInstructions(spec, ctx)}

Spec JSON (the source of truth for this module):
\`\`\`json
${specJson}
\`\`\`

How to read the spec:
- Each "entity" node is a data model: create one model/table per entity, with
  fields mapped from fieldType (string/int/float/bool/date/uuid/text -> the
  natural equivalent in the target ORM; "relation" fields reference another
  entity by id via "relatesTo").
- Each "database" node names a storage system ("storageType": postgres/mysql/
  sqlite/mongodb/redis/dynamodb) that entities connected to it (via a
  "stored_in" edge) live in. If the module only ever targets one database,
  a single database node just confirms/documents the choice; if there's more
  than one, partition entities/config accordingly.
- Each "queue" node names a message broker ("queueType": redis/rabbitmq/kafka)
  that other nodes connected to it (via any edge) publish to or consume from --
  wire up a client for it and stub the publish/consume calls implied by the
  connected nodes' behavior/comments.
- Each "interface" node is an abstract contract: a named set of "methods"
  (name, params, returnType). A node connected to it via an "implements" edge
  should provide a concrete implementation of every listed method. Render
  this as whatever your target language's natural equivalent is (an ABC/
  Protocol in Python, a trait in Rust, an interface in Go, an abstract
  class/interface in TS/Java/C#).
- Each "endpoint" node is one HTTP route: method + path define the route,
  "request"/"response" describe the body shape (kind "entity_ref" means "the
  fields of that entity, minus excludeFields"; kind "custom" is an inline field
  list; kind "node_ref" points at a standalone input/output node in this same
  spec -- resolve its fields the same way as a custom shape).
- "behavior" on an endpoint is free text describing what the handler should do,
  including any edge cases the diagram author called out. It may already
  include implementation notes folded in from a connected "implementation"
  node. Implement exactly what it describes; where it is silent, make a
  reasonable, idiomatic choice and add a one-line comment above the route
  explaining the decision so it stays auditable.
- Every node may carry a "comment" -- free-text author notes. Treat these as
  additional context/intent, same as "behavior"/"notes".
- "external" nodes (e.g. Stripe, S3) should be stubbed out as a small client
  module with clearly marked TODOs -- do not wire up real credentials or make
  network calls to them.
- Node "position" fields are purely for the canvas layout and carry no
  meaning for code generation -- ignore them.
- Edge types describe relationships between nodes: "depends_on" (uses),
  "implements" (provides a concrete implementation of an interface),
  "extends" (inheritance), "has_one"/"has_many" (association cardinality
  between entities -- reflect this in the generated schema/ORM relations),
  "stored_in" (entity lives in that database), "provides_input"/
  "provides_output" (already folded into the connected endpoint's
  request/response above), "association" (generic connection), "custom" (a
  free-text "label" describing a relationship that didn't fit the above --
  use your judgment on what it implies for the generated code).

Output: the full runnable repo written to disk in the current directory (not a
snippet, not a plan).`;
}

const FRONTEND_FRAMEWORK_INSTRUCTIONS: Record<FrontendLanguageId, string> = {
  react: "Target framework: React (with a standard bundler/dev-server setup such as Vite).",
  vue: "Target framework: Vue 3 (with a standard bundler/dev-server setup such as Vite).",
  svelte: "Target framework: Svelte (SvelteKit or plain Svelte + Vite).",
  angular: "Target framework: Angular, via the standard Angular CLI project layout.",
  solidjs: "Target framework: SolidJS (with a standard bundler/dev-server setup such as Vite).",
};

/** Builds the generation prompt for a frontend module, handed to the agent as a file it reads. */
export function buildFrontendGeneratePrompt(spec: ModuleSpec, language: FrontendLanguageId, ctx: GenerateContext): string {
  const specJson = JSON.stringify(spec, null, 2);
  return `You are generating a frontend module's source code from an architecture
spec produced by a visual diagram editor called March. Write a complete,
runnable implementation to the current working directory, with a short
README.md in it explaining how to run it. Do not ask questions -- make
reasonable decisions and proceed.

${FRONTEND_FRAMEWORK_INSTRUCTIONS[language]}
Produce a single runnable repo in the current directory with the framework's
normal project manifest and tooling (bundler config, package.json scripts for
dev/build).

${sharedInstructions(spec, ctx)}

Spec JSON (the source of truth for this module):
\`\`\`json
${specJson}
\`\`\`

How to read the spec:
- Each "component" node is a reusable UI component: create one component per
  node, with "props" (name/propType pairs, same shape as an entity's fields)
  becoming its props/inputs in whatever form is idiomatic for the target
  framework (TS interface, PropTypes, Vue defineProps, etc.).
- Each "page" node is a routed view: create one page/route per node at its
  "path", wiring up the target framework's normal router (React Router,
  Vue Router, SvelteKit routes, Angular Router, Solid Router).
- Each "store" node is client-side state: create one store/slice per node
  with "fields" describing its shape, using whatever state approach is
  idiomatic for the framework (Redux/Zustand/Context for React, Pinia for
  Vue, Svelte stores, Angular services, Solid stores).
- Each "api_client" node describes a call boundary out to a backend: create a
  small client module for it. "baseUrl" is the backend's base URL if known
  (leave configurable via an env var if empty); "notes" describes what it's
  used for -- stub the actual request/response shapes with clear TODOs since
  this module's own diagram is the source of truth for the frontend, not the
  backend's.
- Every node may carry a "comment" -- free-text author notes. Treat these as
  additional context/intent alongside "notes".
- Node "position" fields are purely for the canvas layout and carry no
  meaning for code generation -- ignore them.
- Edge types describe relationships between nodes: "depends_on" (uses),
  "association" (generic connection), "custom" (a free-text "label"
  describing a relationship that didn't fit the above -- use your judgment
  on what it implies, e.g. "a page renders a component", "a component reads
  from a store", "a store calls an api_client").

Output: the full runnable repo written to disk in the current directory (not a
snippet, not a plan).`;
}

/**
 * Builds the headless whole-workspace-autodiscovery prompt: explore the
 * entire open folder (not just one directory), identify every distinct
 * module/service in it -- backend or frontend -- and emit one spec per
 * module plus the cross-module relationships, all in one JSON document.
 * Modules are referenced by name in "edges" (not id/slug) since none exist
 * yet -- the extension host assigns slugs once each module is actually
 * created on disk.
 */
export function buildAutodiscoverProjectPrompt(outputPath: string): string {
  return `You are reverse-engineering a lightweight architecture spec from an
existing codebase in the current working directory (the root of the whole
project, which may contain one or several backend and/or frontend
modules/services), for import into a visual diagram editor called March.
Explore the repository (read files, do not modify anything) and infer its
structure.

Produce a JSON document matching this shape and write it to this exact
absolute path: ${outputPath}
This is the only file you should write anywhere -- do not modify any file
inside the current working directory.

{
  "version": "1.0",
  "modules": [
    {
      "kind": "backend"|"frontend",
      "language": "typescript"|"python"|"rust"|"go"|"java"|"csharp"|"ruby"|"php", // if kind is "backend"
      // "language": "react"|"vue"|"svelte"|"angular"|"solidjs", // if kind is "frontend" -- pick whichever this field means for the module's kind, never both
      "codePath": string, // path to this module's root dir, relative to the current working directory ("." if the whole repo is one module)
      "spec": {
        "version": "1.0",
        "module": { "name": string, "description": string },
        "nodes": [
          // every node type below shares { "id", "position": {"x":0,"y":0}, "comment": string } plus its own fields

          // backend node types (use these when "kind" is "backend"):
          // type "entity": { "type": "entity", "name", "fields": [{ "name", "fieldType": "string"|"int"|"float"|"bool"|"date"|"uuid"|"relation"|"text", "required": bool, "unique": bool, "relatesTo"?: entityId }] }
          // type "database": { "type": "database", "name", "storageType": "postgres"|"mysql"|"sqlite"|"mongodb"|"redis"|"dynamodb" }
          // type "queue": { "type": "queue", "name", "queueType": "redis"|"rabbitmq"|"kafka" }
          // type "interface": { "type": "interface", "name", "methods": [{ "name", "params": [{"name","paramType"}], "returnType" }] }
          // type "endpoint": { "type": "endpoint", "method": "GET"|"POST"|"PUT"|"PATCH"|"DELETE", "path", "behavior": string, "auth": "none"|"required", "request"?: {"kind":"entity_ref","entityId":string,"excludeFields":string[]} | {"kind":"custom","fields":[...]}, "response"?: same union as request }
          // type "external": { "type": "external", "name", "notes": string }

          // frontend node types (use these when "kind" is "frontend"):
          // type "component": { "type": "component", "name", "props": [{ "name", "fieldType": "string"|"int"|"float"|"bool"|"date"|"uuid"|"relation"|"text", "required": bool, "unique": bool }] }
          // type "page": { "type": "page", "name", "path": string }
          // type "store": { "type": "store", "name", "fields": [{ "name", "fieldType": ..., "required": bool, "unique": bool }] }
          // type "api_client": { "type": "api_client", "name", "baseUrl": string, "notes": string }
        ],
        "edges": [
          // backend edge types: { "id", "type": "depends_on"|"implements"|"extends"|"has_one"|"has_many"|"stored_in"|"association", "source": nodeId, "target": nodeId }
          // frontend edge types: { "id", "type": "depends_on"|"association", "source": nodeId, "target": nodeId }
          // or, for either kind, a relationship that doesn't fit the above: { "id", "type": "custom", "label": string, "source": nodeId, "target": nodeId }
        ]
      }
    }
  ],
  "edges": [
    // relationships BETWEEN modules (not within one, and not restricted to
    // same-kind pairs -- a frontend module calling a backend module's API is
    // exactly the kind of edge this is for) -- reference modules by their
    // "spec.module.name" above, since they have no other id yet:
    // { "source": moduleName, "target": moduleName, "label": string }
  ]
}

Guidelines:
- First decide module boundaries: a monorepo with clearly separate
  deployable services/packages (e.g. distinct top-level dirs each with their
  own manifest/entrypoint) is several modules; a single cohesive backend (or
  frontend) is one module with "codePath": ".". A repo with both an API and
  a UI is at least two modules -- one "backend", one "frontend" -- don't
  force them into one.
- Within each backend module, follow the same inference rules as
  single-module discovery: entities from ORM schema/migrations/models plus
  a "database" node for their storage system, "queue" nodes from
  message-broker clients/config, endpoints from route definitions
  (summarize each handler's actual behavior into "behavior" in your own
  words), "interface" nodes from abstract base classes/traits/protocols
  with an "implements" edge from whatever concretely implements them, and
  "external" nodes from third-party SDK imports/env vars (Stripe, S3,
  Twilio, etc.).
- Within each frontend module: a "component" per reusable UI component
  (its "props" are its inputs), a "page" per routed view (its "path" is the
  route), a "store" per client-side state unit (Redux slice, Pinia store,
  Context, Svelte store, Angular service, etc. -- whatever the framework's
  own pattern is), and an "api_client" per call boundary out to a backend
  (name it after what it calls, "baseUrl" if it's evident from config/env
  vars, "notes" for anything else worth knowing).
- At the top level, add an "edges" entry for every cross-module relationship
  you can infer (one module calling another's API, sharing a database,
  publishing/consuming from the same queue, importing the other as a
  library, a frontend module's api_client hitting a backend module's
  endpoints, etc.) with a short freeform "label" describing it.
- Assign every node a unique "id" within its own module (short slug-like
  strings are fine, they only need to be unique inside that module's node
  list) and lay them out on a simple grid via "position" (x/y in increments
  of 220).
- When you are done, the file at ${outputPath} must contain valid JSON
  matching the shape above and nothing else should have been modified.`;
}
