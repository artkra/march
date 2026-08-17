import { z } from "zod";

export const FIELD_TYPES = [
  "string",
  "int",
  "float",
  "bool",
  "date",
  "uuid",
  "relation",
  "text",
] as const;
export const fieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export const fieldSchema = z.object({
  name: z.string().min(1),
  fieldType: fieldTypeSchema,
  required: z.boolean().default(false),
  unique: z.boolean().default(false),
  relatesTo: z.string().optional(),
});
export type Field = z.infer<typeof fieldSchema>;

export const methodParamSchema = z.object({
  name: z.string().min(1),
  paramType: z.string().default(""),
});
export type MethodParam = z.infer<typeof methodParamSchema>;

export const methodSchema = z.object({
  name: z.string().min(1),
  params: z.array(methodParamSchema).default([]),
  returnType: z.string().default(""),
});
export type Method = z.infer<typeof methodSchema>;

export const STORAGE_TYPES = ["postgres", "mysql", "sqlite", "mongodb", "redis", "dynamodb"] as const;
export const storageTypeSchema = z.enum(STORAGE_TYPES);
export type StorageType = z.infer<typeof storageTypeSchema>;

export const QUEUE_TYPES = ["redis", "rabbitmq", "kafka"] as const;
export const queueTypeSchema = z.enum(QUEUE_TYPES);
export type QueueType = z.infer<typeof queueTypeSchema>;

export const STORAGE_TYPE_ICONS: Record<StorageType, string> = {
  postgres: "🐘",
  mysql: "🐬",
  sqlite: "🪶",
  mongodb: "🍃",
  redis: "🔴",
  dynamodb: "⚡",
};

export const QUEUE_TYPE_ICONS: Record<QueueType, string> = {
  redis: "🔴",
  rabbitmq: "🐇",
  kafka: "📨",
};

export const positionSchema = z.object({ x: z.number(), y: z.number() });
export type Position = z.infer<typeof positionSchema>;

export const shapeRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entity_ref"), entityId: z.string(), excludeFields: z.array(z.string()).default([]) }),
  z.object({ kind: z.literal("node_ref"), nodeId: z.string() }),
  z.object({ kind: z.literal("custom"), fields: z.array(fieldSchema) }),
]);
export type ShapeRef = z.infer<typeof shapeRefSchema>;

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const httpMethodSchema = z.enum(HTTP_METHODS);

// Every node carries a free-text comment, on top of its type-specific fields.
const nodeBase = { id: z.string(), position: positionSchema, comment: z.string().default("") };

export const entityNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("entity"),
  name: z.string().min(1),
  fields: z.array(fieldSchema).default([]),
});

export const endpointNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("endpoint"),
  method: httpMethodSchema,
  path: z.string().min(1),
  request: shapeRefSchema.optional(),
  response: shapeRefSchema.optional(),
  behavior: z.string().default(""),
  auth: z.enum(["none", "required"]).default("none"),
});

export const interfaceNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("interface"),
  name: z.string().min(1),
  methods: z.array(methodSchema).default([]),
});

export const databaseNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("database"),
  name: z.string().min(1),
  storageType: storageTypeSchema.default("postgres"),
});

export const queueNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("queue"),
  name: z.string().min(1),
  queueType: queueTypeSchema.default("redis"),
});

export const implementationNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("implementation"),
  name: z.string().min(1),
  notes: z.string().default(""),
});

export const inputNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("input"),
  name: z.string().min(1),
  fields: z.array(fieldSchema).default([]),
});

export const outputNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("output"),
  name: z.string().min(1),
  fields: z.array(fieldSchema).default([]),
});

export const externalNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("external"),
  name: z.string().min(1),
  notes: z.string().default(""),
});

// Frontend-module node vocabulary -- a separate set from the backend one
// above, since a UI's building blocks (components/pages/client-side state)
// don't map onto entities/endpoints/databases. Both live in the same
// discriminated union so a spec's shape doesn't need to branch on module
// kind; Palette.tsx is what actually restricts which of these a given
// module's canvas offers (see nodeTypesForKind below).
export const componentNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("component"),
  name: z.string().min(1),
  props: z.array(fieldSchema).default([]),
});

export const pageNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("page"),
  name: z.string().min(1),
  path: z.string().default("/"),
});

export const storeNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("store"),
  name: z.string().min(1),
  fields: z.array(fieldSchema).default([]),
});

export const apiClientNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("api_client"),
  name: z.string().min(1),
  baseUrl: z.string().default(""),
  notes: z.string().default(""),
});

export const nodeSchema = z.discriminatedUnion("type", [
  entityNodeSchema,
  endpointNodeSchema,
  interfaceNodeSchema,
  databaseNodeSchema,
  queueNodeSchema,
  implementationNodeSchema,
  inputNodeSchema,
  outputNodeSchema,
  externalNodeSchema,
  componentNodeSchema,
  pageNodeSchema,
  storeNodeSchema,
  apiClientNodeSchema,
]);
export type SpecNode = z.infer<typeof nodeSchema>;
export type NodeType = SpecNode["type"];

export const BACKEND_NODE_TYPES: NodeType[] = [
  "entity",
  "endpoint",
  "interface",
  "database",
  "queue",
  "implementation",
  "input",
  "output",
  "external",
];
export const FRONTEND_NODE_TYPES: NodeType[] = ["component", "page", "store", "api_client"];
export const NODE_TYPES: NodeType[] = [...BACKEND_NODE_TYPES, ...FRONTEND_NODE_TYPES];

export function nodeTypesForKind(kind: ModuleKind): NodeType[] {
  return kind === "frontend" ? FRONTEND_NODE_TYPES : BACKEND_NODE_TYPES;
}

const edgeBase = { id: z.string(), source: z.string(), target: z.string() };

// Any node may connect to any other -- there is no source/target-type gate.
// "custom" carries a free-text label; the others are a curated vocabulary the
// Inspector offers as a dropdown (see EDGE_TYPE_LABELS/EDGE_LABEL_LOOKUP,
// which the frontend canvas uses to read/write the relationship as the
// arrow's own visible text label).
export const edgeSchema = z.discriminatedUnion("type", [
  z.object({ ...edgeBase, type: z.literal("association") }),
  z.object({ ...edgeBase, type: z.literal("depends_on") }),
  z.object({ ...edgeBase, type: z.literal("implements") }),
  z.object({ ...edgeBase, type: z.literal("extends") }),
  z.object({ ...edgeBase, type: z.literal("has_one") }),
  z.object({ ...edgeBase, type: z.literal("has_many") }),
  z.object({ ...edgeBase, type: z.literal("stored_in") }),
  z.object({ ...edgeBase, type: z.literal("provides_input") }),
  z.object({ ...edgeBase, type: z.literal("provides_output") }),
  z.object({ ...edgeBase, type: z.literal("custom"), label: z.string().min(1) }),
]);
export type SpecEdge = z.infer<typeof edgeSchema>;
export type EdgeType = SpecEdge["type"];
export const EDGE_TYPES: EdgeType[] = [
  "association",
  "depends_on",
  "implements",
  "extends",
  "has_one",
  "has_many",
  "stored_in",
  "provides_input",
  "provides_output",
  "custom",
];

/** Human-readable labels, also used as the arrow's on-canvas text for each curated type. */
export const EDGE_TYPE_LABELS: Record<EdgeType, string> = {
  association: "association",
  depends_on: "depends on",
  implements: "implements",
  extends: "extends",
  has_one: "has one",
  has_many: "has many",
  stored_in: "stored in",
  provides_input: "provides input",
  provides_output: "provides output",
  custom: "custom...",
};

/** Reverse lookup used when exporting: arrow text -> curated edge type, else `custom`. */
export const EDGE_LABEL_LOOKUP: Record<string, EdgeType> = Object.fromEntries(
  EDGE_TYPES.filter((t) => t !== "custom").map((t) => [EDGE_TYPE_LABELS[t], t]),
);

export const moduleSpecSchema = z.object({
  version: z.literal("1.0"),
  module: z.object({
    name: z.string().min(1),
    description: z.string().default(""),
  }),
  nodes: z.array(nodeSchema).default([]),
  edges: z.array(edgeSchema).default([]),
});
export type ModuleSpec = z.infer<typeof moduleSpecSchema>;

// The project-level "root" canvas: nodes reference modules, edges are
// freeform-labeled cross-module relationships (informal by nature, so no
// curated type enum here the way module-level edges have one).
export const projectGraphNodeSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  position: positionSchema,
});
export const projectGraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().default(""),
});
export const projectGraphSchema = z.object({
  version: z.literal("1.0"),
  nodes: z.array(projectGraphNodeSchema).default([]),
  edges: z.array(projectGraphEdgeSchema).default([]),
});
export type ProjectGraph = z.infer<typeof projectGraphSchema>;

export function parseProjectGraph(data: unknown): ProjectGraph {
  return projectGraphSchema.parse(data);
}

export function safeParseProjectGraph(data: unknown) {
  return projectGraphSchema.safeParse(data);
}

// The stack decision that actually matters per-module is the programming
// language/framework -- everything else within it is left to the agent's
// judgment at generation time (see jobs/prompts.ts), same as any other
// "unspecified, agent decides" gap. Backend and frontend modules pick from
// separate lists, since "Rust" and "React" aren't comparable choices -- see
// MODULE_KINDS/ModuleKind below for the module-level split that determines
// which list applies, and languagesForKind() to fetch the right one.
export const BACKEND_LANGUAGES = [
  { id: "typescript", label: "TypeScript / Node.js", icon: "🟩" },
  { id: "python", label: "Python", icon: "🐍" },
  { id: "rust", label: "Rust", icon: "🦀" },
  { id: "go", label: "Go", icon: "🐹" },
  { id: "java", label: "Java", icon: "☕" },
  { id: "csharp", label: "C# / .NET", icon: "🔷" },
  { id: "ruby", label: "Ruby", icon: "💎" },
  { id: "php", label: "PHP", icon: "🐘" },
] as const;
export type BackendLanguageId = (typeof BACKEND_LANGUAGES)[number]["id"];

export const FRONTEND_LANGUAGES = [
  { id: "react", label: "React", icon: "⚛️" },
  { id: "vue", label: "Vue", icon: "💚" },
  { id: "svelte", label: "Svelte", icon: "🔥" },
  { id: "angular", label: "Angular", icon: "🅰️" },
  { id: "solidjs", label: "SolidJS", icon: "🔷" },
] as const;
export type FrontendLanguageId = (typeof FRONTEND_LANGUAGES)[number]["id"];

/** Any language id, backend or frontend -- what a module's own `language` field holds. */
export type LanguageId = BackendLanguageId | FrontendLanguageId;

export const MODULE_KINDS = ["backend", "frontend"] as const;
export type ModuleKind = (typeof MODULE_KINDS)[number];

export function languagesForKind(kind: ModuleKind): readonly { id: LanguageId; label: string; icon: string }[] {
  return kind === "frontend" ? FRONTEND_LANGUAGES : BACKEND_LANGUAGES;
}

export function parseModuleSpec(data: unknown): ModuleSpec {
  return moduleSpecSchema.parse(data);
}

export function safeParseModuleSpec(data: unknown) {
  return moduleSpecSchema.safeParse(data);
}

const BACKEND_LANGUAGE_IDS = BACKEND_LANGUAGES.map((l) => l.id) as [BackendLanguageId, ...BackendLanguageId[]];
const FRONTEND_LANGUAGE_IDS = FRONTEND_LANGUAGES.map((l) => l.id) as [FrontendLanguageId, ...FrontendLanguageId[]];

// Output of a whole-workspace "autodiscover" job: one ModuleSpec per
// identified module (mirroring a single discoverModule result) plus
// freeform-labeled edges between them by module name, since the agent
// doesn't know module slugs yet -- those are only assigned once each
// discovered module is actually created on disk. `kind` picks which of the
// two language lists `language` is validated against, same split as a
// manually-created module.
export const projectDiscoveryModuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("backend"), language: z.enum(BACKEND_LANGUAGE_IDS), codePath: z.string().min(1), spec: moduleSpecSchema }),
  z.object({ kind: z.literal("frontend"), language: z.enum(FRONTEND_LANGUAGE_IDS), codePath: z.string().min(1), spec: moduleSpecSchema }),
]);
export type ProjectDiscoveryModule = z.infer<typeof projectDiscoveryModuleSchema>;

export const projectDiscoveryEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string().default(""),
});

export const projectDiscoverySchema = z.object({
  version: z.literal("1.0"),
  modules: z.array(projectDiscoveryModuleSchema).default([]),
  edges: z.array(projectDiscoveryEdgeSchema).default([]),
});
export type ProjectDiscovery = z.infer<typeof projectDiscoverySchema>;

export function safeParseProjectDiscovery(data: unknown) {
  return projectDiscoverySchema.safeParse(data);
}
