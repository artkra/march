import { createShapeId, type Editor, type TLShapeId } from "tldraw";
import type { ProjectGraph } from "@march/spec-schema";
import type { ModuleSummary } from "../api/client";

/**
 * Mirrors specImport.ts but for the project-level module graph -- hydrates an
 * empty root canvas from a persisted graph (used the first time a graph
 * produced by whole-project autodiscovery is opened, since discovery only
 * ever produces graph JSON, never a tldraw snapshot).
 */
export function importProjectGraph(editor: Editor, graph: ProjectGraph, modules: ModuleSummary[]) {
  const moduleBySlug = new Map(modules.map((m) => [m.slug, m]));
  const shapeIdByNodeId = new Map<string, TLShapeId>();

  editor.run(() => {
    for (const node of graph.nodes) {
      const module = moduleBySlug.get(node.moduleId);
      if (!module) continue;
      const shapeId = createShapeId(node.id);
      shapeIdByNodeId.set(node.id, shapeId);
      editor.createShape({
        id: shapeId,
        type: "module_ref",
        x: node.position.x,
        y: node.position.y,
        props: { w: 200, h: 84, moduleSlug: module.slug, label: module.name, language: module.language },
      });
    }

    for (const edge of graph.edges) {
      const fromShapeId = shapeIdByNodeId.get(edge.source);
      const toShapeId = shapeIdByNodeId.get(edge.target);
      if (!fromShapeId || !toShapeId) continue;

      const arrowId = createShapeId(edge.id);
      editor.createShape({ id: arrowId, type: "arrow", x: 0, y: 0, props: { text: edge.label } });
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
  });
}
