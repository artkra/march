import { useEffect, useRef, useState } from "react";
import { Tldraw, createShapeId, type Editor } from "tldraw";
import { api, type DiagramRecord } from "../api/client";
import { NODE_SHAPE_UTILS, NODE_DEFAULTS } from "./nodeShapes";
import { installDrawRecognition } from "./drawRecognition";
import { exportSpec } from "./specExport";
import { importSpec } from "./specImport";
import { Palette, PALETTE_DRAG_MIME } from "./Palette";
import { Inspector } from "./Inspector";
import type { LanguageId, ModuleKind, NodeType, SpecNode } from "@march/spec-schema";

function isEmptySnapshot(snapshot: unknown): boolean {
  return !snapshot || typeof snapshot !== "object" || Object.keys(snapshot).length === 0;
}

export function CanvasEditor({
  moduleSlug,
  moduleName,
  moduleDescription,
  moduleKind,
  moduleLanguage,
  diagram,
  backTo,
}: {
  moduleSlug: string;
  moduleName: string;
  moduleDescription: string;
  moduleKind: ModuleKind;
  moduleLanguage: string;
  diagram: DiagramRecord;
  backTo: string;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [language, setLanguage] = useState(moduleLanguage);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;

    const hadSnapshot = !isEmptySnapshot(diagram.tldrawSnapshot);
    if (hadSnapshot) {
      editor.loadSnapshot(diagram.tldrawSnapshot as Parameters<Editor["loadSnapshot"]>[0]);
    }
    // Always reconcile against the spec, not just on a from-empty canvas --
    // Generate may have made small additions to it (see prompts.ts) that
    // this canvas hasn't rendered yet. importSpec no-ops for anything that
    // already has a shape, so this is a cheap no-op in the common case.
    importSpec(editor, diagram.specJson, { zoomToFit: !hadSnapshot });

    const unsubscribeDraw = installDrawRecognition(editor, moduleKind);

    const save = () => {
      const { spec } = exportSpec(editor, { name: moduleName, description: moduleDescription });
      void api.saveDiagram(moduleSlug, { tldrawSnapshot: editor.getSnapshot(), specJson: spec });
    };

    const unsubscribeStore = editor.store.listen(
      () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(save, 800);
      },
      { source: "user", scope: "document" },
    );

    return () => {
      unsubscribeDraw?.();
      unsubscribeStore();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!editor) return;
    const nodeType = e.dataTransfer.getData(PALETTE_DRAG_MIME) as NodeType;
    if (!nodeType || !NODE_DEFAULTS[nodeType]) return;
    const point = editor.screenToPage({ x: e.clientX, y: e.clientY });
    const id = createShapeId();
    const node: SpecNode = {
      id,
      position: { x: point.x, y: point.y },
      ...NODE_DEFAULTS[nodeType](),
    } as unknown as SpecNode;
    editor.createShape({
      id,
      type: nodeType,
      x: point.x - 110,
      y: point.y - 48,
      props: { w: 220, h: 96, node },
    });
    editor.setSelectedShapes([id]);
  };

  const handleLanguageChange = (next: LanguageId) => {
    setLanguage(next);
    void api.updateModule(moduleSlug, { language: next });
  };

  return (
    <div className="module-layout">
      <Palette
        backTo={backTo}
        moduleName={moduleName}
        moduleKind={moduleKind}
        language={language}
        onLanguageChange={handleLanguageChange}
      />
      <div
        className="canvas-area"
        ref={containerRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <Tldraw shapeUtils={NODE_SHAPE_UTILS} onMount={setEditor} />
        {editor && <Inspector editor={editor} />}
      </div>
    </div>
  );
}
