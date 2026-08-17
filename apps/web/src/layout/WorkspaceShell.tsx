import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { NavPanel } from "../nav/NavPanel";

const STORAGE_KEY = "march-nav-collapsed";

export function WorkspaceShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className={collapsed ? "shell nav-collapsed" : "shell"}>
      <NavPanel collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      <div className="workspace-main">
        <Outlet />
      </div>
    </div>
  );
}
