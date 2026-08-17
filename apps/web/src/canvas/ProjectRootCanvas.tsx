import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tldraw, createShapeId, type Editor } from "tldraw";
import { api } from "../api/client";
import { ModuleRefShapeUtil, type ModuleRefShape, type MarchNavigableEditor } from "./moduleRefShape";
import { exportProjectGraph } from "./projectGraphExport";
import { importProjectGraph } from "./projectGraphImport";

const SHAPE_UTILS = [ModuleRefShapeUtil];

function isEmptySnapshot(snapshot: unknown): boolean {
  return !snapshot || typeof snapshot !== "object" || Object.keys(snapshot).length === 0;
}

export function ProjectRootCanvas() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const project = useQuery({ queryKey: ["project"], queryFn: api.getProject });
  const modules = useQuery({ queryKey: ["modules"], queryFn: api.listModules });
  const rootDiagram = useQuery({ queryKey: ["root-diagram"], queryFn: api.getRootDiagram });

  const [editor, setEditor] = useState<Editor | null>(null);
  const [description, setDescription] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (project.data) setDescription(project.data.description ?? "");
  }, [project.data]);

  useEffect(() => {
    if (!editor || !project.data || !modules.data || !rootDiagram.data || initialized.current) return;
    initialized.current = true;

    (editor as unknown as MarchNavigableEditor).__marchNavigate = (slug: string) => {
      navigate(`/m/${slug}`);
    };

    if (!isEmptySnapshot(rootDiagram.data.tldrawSnapshot)) {
      editor.loadSnapshot(rootDiagram.data.tldrawSnapshot as Parameters<Editor["loadSnapshot"]>[0]);
    } else if (rootDiagram.data.graphJson.nodes.length > 0) {
      // A from-empty canvas whose graphJson is already populated means
      // whole-project autodiscovery ran before this canvas was ever opened --
      // hydrate nodes/edges from it, same as a discovered module's spec.
      importProjectGraph(editor, rootDiagram.data.graphJson, modules.data);
    }

    // Auto-create a node for any module that doesn't have one on the graph
    // yet, refresh the label/language shown on ones that already exist --
    // those are a snapshot of the module at the time its node was created, so
    // a later rename or tech-stack change (from the module's own canvas)
    // would otherwise go on showing the stale value here forever -- and
    // remove nodes (plus whatever arrows point at them) for modules that
    // were deleted since this canvas was last opened.
    const moduleRefShapes = editor.getCurrentPageShapes().filter((s): s is ModuleRefShape => s.type === "module_ref");
    const existingBySlug = new Map(moduleRefShapes.map((s) => [s.props.moduleSlug, s]));
    const currentSlugs = new Set(modules.data.map((m) => m.slug));
    const missing = modules.data.filter((m) => !existingBySlug.has(m.slug));
    const stale = modules.data.filter((m) => {
      const shape = existingBySlug.get(m.slug);
      return shape && (shape.props.label !== m.name || shape.props.language !== m.language);
    });
    const orphaned = moduleRefShapes.filter((s) => !currentSlugs.has(s.props.moduleSlug));

    if (missing.length > 0 || stale.length > 0 || orphaned.length > 0) {
      const startIndex = existingBySlug.size;
      editor.run(() => {
        missing.forEach((module, i) => {
          const index = startIndex + i;
          const col = index % 4;
          const row = Math.floor(index / 4);
          editor.createShape({
            id: createShapeId(),
            type: "module_ref",
            x: col * 260,
            y: row * 140,
            props: { w: 200, h: 84, moduleSlug: module.slug, label: module.name, language: module.language },
          });
        });
        stale.forEach((module) => {
          const shape = existingBySlug.get(module.slug)!;
          editor.updateShape({
            id: shape.id,
            type: "module_ref",
            props: { ...shape.props, label: module.name, language: module.language },
          });
        });
        orphaned.forEach((shape) => {
          const arrowIds = editor.getBindingsInvolvingShape(shape.id, "arrow").map((b) => b.fromId);
          editor.deleteShapes([...arrowIds, shape.id]);
        });
      });
    }

    editor.zoomToFit();

    const save = () => {
      const graph = exportProjectGraph(editor);
      void api.saveRootDiagram({ tldrawSnapshot: editor.getSnapshot(), graphJson: graph });
    };
    const unsubscribe = editor.store.listen(
      () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(save, 800);
      },
      { source: "user", scope: "document" },
    );

    return () => {
      unsubscribe();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [editor, project.data, modules.data, rootDiagram.data, navigate]);

  const commitDescription = () => {
    void api.updateProject({ description }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["project"] });
    });
  };

  if (!project.data || !rootDiagram.data) {
    return <div className="workspace-empty">Loading...</div>;
  }

  return (
    <div className="root-canvas-area">
      <Tldraw shapeUtils={SHAPE_UTILS} onMount={setEditor} />
      <div className="toolbar" style={{ left: 8, right: "auto", flexDirection: "column", alignItems: "flex-start" }}>
        <strong>{project.data.name}</strong>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
          placeholder="General project comments/notes..."
          rows={2}
          style={{ width: 320, marginTop: 4, fontSize: 12, resize: "vertical" }}
        />
      </div>
    </div>
  );
}
