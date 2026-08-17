import { BaseBoxShapeUtil, HTMLContainer, T, resizeBox } from "tldraw";
import type { TLBaseShape, TLResizeInfo } from "tldraw";
import { QUEUE_TYPE_ICONS, STORAGE_TYPE_ICONS, type NodeType, type SpecNode } from "@march/spec-schema";

export interface NodeShapeProps {
  w: number;
  h: number;
  node: SpecNode;
}

export type NodeShape = TLBaseShape<NodeType, NodeShapeProps>;

export const NODE_DEFAULTS: Record<NodeType, () => Omit<SpecNode, "id" | "position">> = {
  entity: () => ({ type: "entity", name: "NewEntity", fields: [], comment: "" }),
  endpoint: () => ({
    type: "endpoint",
    method: "GET",
    path: "/resource",
    behavior: "",
    auth: "none",
    comment: "",
  }),
  interface: () => ({ type: "interface", name: "NewInterface", methods: [], comment: "" }),
  database: () => ({ type: "database", name: "Database", storageType: "postgres", comment: "" }),
  queue: () => ({ type: "queue", name: "Queue", queueType: "redis", comment: "" }),
  implementation: () => ({ type: "implementation", name: "Implementation notes", notes: "", comment: "" }),
  input: () => ({ type: "input", name: "Input", fields: [], comment: "" }),
  output: () => ({ type: "output", name: "Output", fields: [], comment: "" }),
  external: () => ({ type: "external", name: "External service", notes: "", comment: "" }),
  component: () => ({ type: "component", name: "NewComponent", props: [], comment: "" }),
  page: () => ({ type: "page", name: "NewPage", path: "/", comment: "" }),
  store: () => ({ type: "store", name: "NewStore", fields: [], comment: "" }),
  api_client: () => ({ type: "api_client", name: "ApiClient", baseUrl: "", notes: "", comment: "" }),
};

const NODE_META: Record<NodeType, { icon: string; color: string; label: string }> = {
  entity: { icon: "▤", color: "#0ea5e9", label: "Entity" },
  endpoint: { icon: "⇄", color: "#4f46e5", label: "Endpoint" },
  interface: { icon: "◇", color: "#e879f9", label: "Interface" },
  database: { icon: "⛁", color: "#059669", label: "Database" },
  queue: { icon: "📨", color: "#d97706", label: "Queue" },
  implementation: { icon: "⚙", color: "#a855f7", label: "Implementation" },
  input: { icon: "→", color: "#16a34a", label: "Input" },
  output: { icon: "←", color: "#ea580c", label: "Output" },
  external: { icon: "☁", color: "#71717a", label: "External" },
  component: { icon: "◧", color: "#0ea5e9", label: "Component" },
  page: { icon: "▢", color: "#4f46e5", label: "Page" },
  store: { icon: "⛁", color: "#059669", label: "Store" },
  api_client: { icon: "⇄", color: "#d97706", label: "API client" },
};

function nodeTitle(node: SpecNode): string {
  if (node.type === "endpoint") return `${node.method} ${node.path}`;
  if (node.type === "page") return node.path;
  return node.name;
}

function nodeSubtitle(node: SpecNode): string {
  switch (node.type) {
    case "entity":
    case "input":
    case "output":
    case "store":
      return node.fields.length ? node.fields.map((f) => f.name).join(", ") : "(no fields)";
    case "component":
      return node.props.length ? node.props.map((f) => f.name).join(", ") : "(no props)";
    case "interface":
      return node.methods.length ? node.methods.map((m) => `${m.name}()`).join(", ") : "(no methods)";
    case "database":
      return `${STORAGE_TYPE_ICONS[node.storageType]} ${node.storageType}`;
    case "queue":
      return `${QUEUE_TYPE_ICONS[node.queueType]} ${node.queueType}`;
    case "endpoint":
      return node.behavior || "(behavior unset)";
    case "page":
      return node.name;
    case "implementation":
    case "external":
    case "api_client":
      return node.notes || "";
    default:
      return "";
  }
}

/**
 * Shared base for all eight node-type shapes. Rendering is a plain styled card
 * (HTMLContainer) -- editing happens in the Inspector side panel, not inline,
 * so this stays a read-only preview.
 */
abstract class NodeShapeUtilBase extends BaseBoxShapeUtil<NodeShape> {
  abstract nodeType: NodeType;

  override getDefaultProps(): NodeShapeProps {
    return {
      w: 220,
      h: 96,
      node: { id: "", position: { x: 0, y: 0 }, ...NODE_DEFAULTS[this.nodeType]() } as unknown as SpecNode,
    };
  }

  override onResize = (shape: NodeShape, info: TLResizeInfo<NodeShape>) => {
    return resizeBox(shape, info);
  };

  override component(shape: NodeShape) {
    const meta = NODE_META[this.nodeType];
    return (
      <HTMLContainer
        style={{
          width: shape.props.w,
          height: shape.props.h,
          border: `2px solid ${meta.color}`,
          borderRadius: 8,
          background: "var(--color-panel, white)",
          padding: "8px 10px",
          overflow: "hidden",
          pointerEvents: "all",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: meta.color, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>
          <span>{meta.icon}</span>
          <span>{meta.label}</span>
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
          {nodeTitle(shape.props.node)}
        </div>
        <div style={{ fontSize: 11, opacity: 0.65, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {nodeSubtitle(shape.props.node)}
        </div>
      </HTMLContainer>
    );
  }

  override indicator(shape: NodeShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />;
  }
}

function defineNodeShapeUtil(nodeType: NodeType) {
  return class extends NodeShapeUtilBase {
    static override type = nodeType;
    static override props = {
      w: T.number,
      h: T.number,
      node: T.jsonValue,
    };
    nodeType = nodeType;
  };
}

export const EntityShapeUtil = defineNodeShapeUtil("entity");
export const EndpointShapeUtil = defineNodeShapeUtil("endpoint");
export const InterfaceShapeUtil = defineNodeShapeUtil("interface");
export const DatabaseShapeUtil = defineNodeShapeUtil("database");
export const QueueShapeUtil = defineNodeShapeUtil("queue");
export const ImplementationShapeUtil = defineNodeShapeUtil("implementation");
export const InputShapeUtil = defineNodeShapeUtil("input");
export const OutputShapeUtil = defineNodeShapeUtil("output");
export const ExternalShapeUtil = defineNodeShapeUtil("external");
export const ComponentShapeUtil = defineNodeShapeUtil("component");
export const PageShapeUtil = defineNodeShapeUtil("page");
export const StoreShapeUtil = defineNodeShapeUtil("store");
export const ApiClientShapeUtil = defineNodeShapeUtil("api_client");

export const NODE_SHAPE_UTILS = [
  EntityShapeUtil,
  EndpointShapeUtil,
  InterfaceShapeUtil,
  DatabaseShapeUtil,
  QueueShapeUtil,
  ImplementationShapeUtil,
  InputShapeUtil,
  OutputShapeUtil,
  ExternalShapeUtil,
  ComponentShapeUtil,
  PageShapeUtil,
  StoreShapeUtil,
  ApiClientShapeUtil,
];

export { NODE_META };
