import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { CanvasEditor } from "../canvas/CanvasEditor";

export function ModulePage() {
  const { slug = "" } = useParams();

  const module = useQuery({ queryKey: ["module", slug], queryFn: () => api.getModule(slug) });

  if (!module.data || !module.data.diagram) {
    return <div className="page">Loading...</div>;
  }

  return (
    <CanvasEditor
      // Forces a full remount (fresh tldraw editor + fresh effect run) when
      // navigating between modules -- without this React reuses the same
      // <Tldraw> instance across module switches (same component position in
      // the tree), so the previous module's canvas just stayed on screen.
      key={slug}
      moduleSlug={slug}
      moduleName={module.data.name}
      moduleDescription={module.data.description ?? ""}
      moduleKind={module.data.kind}
      moduleLanguage={module.data.language}
      diagram={module.data.diagram}
      backTo="/"
    />
  );
}
