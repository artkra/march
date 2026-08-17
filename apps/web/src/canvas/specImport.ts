import { createShapeId, type Editor, type TLShapeId } from "tldraw";
import { EDGE_TYPE_LABELS, type ModuleSpec, type SpecEdge, type SpecNode } from "@march/spec-schema";

const DEFAULT_SIZE: Record<SpecNode["type"], { w: number; h: number }> = {
  entity: { w: 220, h: 120 },
  endpoint: { w: 240, h: 110 },
  interface: { w: 220, h: 120 },
  database: { w: 200, h: 96 },
  queue: { w: 200, h: 96 },
  implementation: { w: 220, h: 96 },
  input: { w: 200, h: 96 },
  output: { w: 200, h: 96 },
  external: { w: 200, h: 96 },
  component: { w: 220, h: 120 },
  page: { w: 200, h: 96 },
  store: { w: 220, h: 120 },
  api_client: { w: 200, h: 96 },
};

function edgeLabel(edge: SpecEdge): string {
  return edge.type === "custom" ? edge.label : EDGE_TYPE_LABELS[edge.type];
}

/**
 * Hydrates a canvas from a spec -- either from empty (the first time a
 * discovered module's diagram is opened, since discovery only ever produces
 * spec JSON, never a tldraw snapshot) or incrementally on top of an
 * already-loaded snapshot. Node/arrow shape ids are deterministic
 * (`createShapeId(node.id)`/`createShapeId(edge.id)`), so any node/edge that
 * already has a shape on the page is left untouched -- this is what makes
 * it safe to call every time a module's canvas mounts, not just when it's
 * empty: if Generate made small additions to the spec to make the module
 * functional (see prompts.ts's diagram round-trip instructions), those
 * additions show up here as shapes the canvas hasn't seen yet and get
 * created, while everything already drawn is left exactly as the user left
 * it. `zoomToFit` only makes sense for a truly fresh, from-empty import --
 * on an incremental call it would yank the camera every time the module is
 * reopened, so callers opt into it explicitly.
 */
export function importSpec(editor: Editor, spec: ModuleSpec, options: { zoomToFit?: boolean } = {}) {
  const shapeIdByNodeId = new Map<string, TLShapeId>();

  editor.run(() => {
    for (const node of spec.nodes) {
      const shapeId = createShapeId(node.id);
      shapeIdByNodeId.set(node.id, shapeId);
      if (editor.getShape(shapeId)) continue;

      const size = DEFAULT_SIZE[node.type];
      const { id: _id, position: _position, ...content } = node;
      editor.createShape({
        id: shapeId,
        type: node.type,
        x: node.position.x,
        y: node.position.y,
        props: { w: size.w, h: size.h, node: { ...content, id: node.id, position: node.position } },
      });
    }

    for (const edge of spec.edges) {
      const arrowId = createShapeId(edge.id);
      if (editor.getShape(arrowId)) continue;

      const fromShapeId = shapeIdByNodeId.get(edge.source);
      const toShapeId = shapeIdByNodeId.get(edge.target);
      if (!fromShapeId || !toShapeId) continue;

      editor.createShape({ id: arrowId, type: "arrow", x: 0, y: 0, props: { text: edgeLabel(edge) } });
      editor.createBindings([
        {
          type: "arrow",
          fromId: arrowId,
          toId: fromShapeId,
          props: { terminal: "start", normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
        },
        {
          type: "arrow",
          fromId: arrowId,
          toId: toShapeId,
          props: { terminal: "end", normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
        },
      ]);
    }

    if (options.zoomToFit) editor.zoomToFit();
  });
}
