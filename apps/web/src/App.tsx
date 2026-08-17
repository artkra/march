import { Routes, Route } from "react-router-dom";
import { WorkspaceShell } from "./layout/WorkspaceShell";
import { ProjectRootCanvas } from "./canvas/ProjectRootCanvas";
import { ModulePage } from "./pages/ModulePage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkspaceShell />}>
        <Route index element={<ProjectRootCanvas />} />
        <Route path="m/:slug" element={<ModulePage />} />
      </Route>
    </Routes>
  );
}
