import { createShapeId, type Editor, type TLDrawShape, type TLShapeId } from "tldraw";
import { classifyStroke, HAND_DRAW_MAP, type Point } from "./shapeClassifier";
import { NODE_DEFAULTS } from "./nodeShapes";
import type { ModuleKind, NodeType, SpecNode } from "@march/spec-schema";

function flattenPoints(shape: TLDrawShape): Point[] {
  return shape.props.segments.flatMap((segment) => segment.points.map((p) => ({ x: p.x, y: p.y })));
}

/**
 * Watches for freehand "draw" strokes finishing (isComplete flips false -> true)
 * and, if the stroke's geometry confidently matches a hand-drawable shape
 * mapped for this module's kind (see HAND_DRAW_MAP -- backend gets all nine,
 * frontend a subset of four), swaps it for the corresponding typed node
 * shape at the same bounding box.
 */
export function installDrawRecognition(editor: Editor, moduleKind: ModuleKind): () => void {
  const unsubscribe = editor.store.listen(
    (entry) => {
      for (const [, to] of Object.values(entry.changes.updated)) {
        if (to.typeName !== "shape" || to.type !== "draw") continue;
        const drawShape = to as TLDrawShape;
        if (!drawShape.props.isComplete) continue;

        const points = flattenPoints(drawShape);
        if (points.length < 6) continue;

        const result = classifyStroke(points);
        if (!result) continue;
        const nodeType = HAND_DRAW_MAP[moduleKind][result.shape];
        if (!nodeType) continue;

        replaceDrawShapeWithNode(editor, drawShape.id, points, nodeType);
      }
    },
    { source: "user", scope: "document" },
  );
  return unsubscribe;
}

function replaceDrawShapeWithNode(
  editor: Editor,
  drawShapeId: TLShapeId,
  localPoints: Point[],
  nodeType: NodeType,
) {
  const shape = editor.getShape(drawShapeId);
  if (!shape) return;

  const minX = Math.min(...localPoints.map((p) => p.x));
  const minY = Math.min(...localPoints.map((p) => p.y));
  const maxX = Math.max(...localPoints.map((p) => p.x));
  const maxY = Math.max(...localPoints.map((p) => p.y));

  const pageX = shape.x + minX;
  const pageY = shape.y + minY;
  const w = Math.max(maxX - minX, 140);
  const h = Math.max(maxY - minY, 90);

  const newId = createShapeId();
  const node: SpecNode = {
    id: newId,
    position: { x: pageX, y: pageY },
    ...NODE_DEFAULTS[nodeType](),
  } as unknown as SpecNode;

  editor.run(() => {
    editor.deleteShape(drawShapeId);
    editor.createShape({
      id: newId,
      type: nodeType,
      x: pageX,
      y: pageY,
      props: { w, h, node },
    });
    // Deliberately not calling setCurrentTool here -- switching back to
    // "select" after every recognized sketch breaks the flow of drawing
    // several shapes in a row. Selecting the new shape still updates the
    // Inspector without touching which tool is active.
    editor.setSelectedShapes([newId]);
  });
}
