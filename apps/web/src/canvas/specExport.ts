import type { Editor, TLArrowShape, TLShape } from "tldraw";
import { getArrowBindings } from "tldraw";
import { EDGE_LABEL_LOOKUP, NODE_TYPES, type ModuleSpec, type NodeType, type SpecNode, type SpecEdge } from "@march/spec-schema";
import type { NodeShape } from "./nodeShapes";

function isNodeShape(shape: TLShape): shape is NodeShape {
  return (NODE_TYPES as string[]).includes(shape.type);
}

function isArrowShape(shape: TLShape): shape is TLArrowShape {
  return shape.type === "arrow";
}

export interface ExportResult {
  spec: ModuleSpec;
  warnings: string[];
}

/** Arrow's own visible text label -> a typed edge (curated match, or "custom" with that text as its label). */
function edgeFromArrowText(id: string, source: string, target: string, text: string): SpecEdge {
  const trimmed = text.trim();
  if (!trimmed) return { id, type: "association", source, target };
  const known = EDGE_LABEL_LOOKUP[trimmed.toLowerCase()];
  if (known === "custom" || !known) return { id, type: "custom", source, target, label: trimmed };
  return { id, type: known, source, target };
}

/**
 * Derives the IR spec from the current tldraw document. Node shape ids/x/y are
 * authoritative (not whatever happens to be cached in props.node.id/position).
 * Any node may connect to any other -- the arrow's own on-canvas text label
 * *is* the relationship (curated word -> typed edge, anything else -> custom).
 */
export function exportSpec(
  editor: Editor,
  moduleMeta: { name: string; description: string },
): ExportResult {
  const warnings: string[] = [];
  const shapes = editor.getCurrentPageShapes();

  const nodeShapes = shapes.filter(isNodeShape);
  const typeByShapeId = new Map<string, NodeType>();
  const nodes: SpecNode[] = nodeShapes.map((shape) => {
    typeByShapeId.set(shape.id, shape.type as NodeType);
    return {
      ...(shape.props.node as SpecNode),
      id: shape.id,
      position: { x: shape.x, y: shape.y },
    };
  });

  const edges: SpecEdge[] = [];
  for (const shape of shapes.filter(isArrowShape)) {
    const bindings = getArrowBindings(editor, shape);
    if (!bindings.start || !bindings.end) {
      warnings.push(`An arrow is not connected at both ends and was skipped.`);
      continue;
    }
    const sourceId = bindings.start.toId;
    const targetId = bindings.end.toId;
    if (!typeByShapeId.has(sourceId) || !typeByShapeId.has(targetId)) {
      warnings.push(`An arrow connects to something that isn't a node and was skipped.`);
      continue;
    }
    edges.push(edgeFromArrowText(shape.id, sourceId, targetId, shape.props.text));
  }

  foldAuxiliaryNodesIntoEndpoints(nodes, edges);

  return {
    spec: { version: "1.0", module: moduleMeta, nodes, edges },
    warnings,
  };
}

/**
 * implementation/input/output nodes are canvas-only conveniences: their
 * content gets folded into the endpoint they're connected to (per
 * spec-schema-v1's "behavior" field and the node-type reconciliation table),
 * so the generator prompt only has to reason about entity/endpoint/external.
 */
function foldAuxiliaryNodesIntoEndpoints(nodes: SpecNode[], edges: SpecEdge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const edge of edges) {
    if (edge.type === "implements") {
      const impl = byId.get(edge.source);
      const endpoint = byId.get(edge.target);
      if (impl?.type === "implementation" && endpoint?.type === "endpoint" && impl.notes.trim()) {
        endpoint.behavior = endpoint.behavior
          ? `${endpoint.behavior}\n\nImplementation notes: ${impl.notes}`
          : `Implementation notes: ${impl.notes}`;
      }
    }
    if (edge.type === "provides_input") {
      const endpoint = byId.get(edge.target);
      if (endpoint?.type === "endpoint") {
        endpoint.request = { kind: "node_ref", nodeId: edge.source };
      }
    }
    if (edge.type === "provides_output") {
      const endpoint = byId.get(edge.source);
      if (endpoint?.type === "endpoint") {
        endpoint.response = { kind: "node_ref", nodeId: edge.target };
      }
    }
  }
}
