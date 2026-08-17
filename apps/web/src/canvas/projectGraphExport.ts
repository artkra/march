import type { Editor, TLArrowShape, TLShape } from "tldraw";
import { getArrowBindings } from "tldraw";
import type { ProjectGraph } from "@march/spec-schema";
import type { ModuleRefShape } from "./moduleRefShape";

function isModuleRefShape(shape: TLShape): shape is ModuleRefShape {
  return shape.type === "module_ref";
}

function isArrowShape(shape: TLShape): shape is TLArrowShape {
  return shape.type === "arrow";
}

/** Mirrors specExport.ts's approach but for the project-level module graph. */
export function exportProjectGraph(editor: Editor): ProjectGraph {
  const shapes = editor.getCurrentPageShapes();
  const moduleRefShapes = shapes.filter(isModuleRefShape);

  const nodes = moduleRefShapes.map((shape) => ({
    id: shape.id,
    // ProjectGraph's "moduleId" field holds the module's slug -- slugs are
    // module identity now, there's no separate DB id.
    moduleId: shape.props.moduleSlug,
    position: { x: shape.x, y: shape.y },
  }));

  const edges = shapes.filter(isArrowShape).flatMap((shape) => {
    const bindings = getArrowBindings(editor, shape);
    if (!bindings.start || !bindings.end) return [];
    return [
      {
        id: shape.id,
        source: bindings.start.toId,
        target: bindings.end.toId,
        label: shape.props.text ?? "",
      },
    ];
  });

  return { version: "1.0", nodes, edges };
}
