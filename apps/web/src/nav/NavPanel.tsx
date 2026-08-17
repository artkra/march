import { useEffect, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ModuleSummary } from "../api/client";
import { NewModuleModal } from "./NewModuleModal";

/**
 * Free-text only, deliberately -- no bundled presets for specific agent
 * CLIs. `agentBin` lives in `.march/project.json` (see MarchStore), not a
 * VS Code setting, so it travels with the project like everything else.
 */
function AgentPicker({ agentBin }: { agentBin: string }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(agentBin);

  useEffect(() => setValue(agentBin), [agentBin]);

  const update = useMutation({
    mutationFn: (bin: string) => api.updateProject({ agentBin: bin }),
    onSuccess: (data) => queryClient.setQueryData(["project"], data),
  });

  return (
    <div className="nav-agent">
      <label>Agent CLI binary</label>
      <div className="nav-agent-custom">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. the CLI command, or a full path to the binary"
        />
        <button
          type="button"
          onClick={() => update.mutate(value)}
          disabled={!value.trim() || value === agentBin || update.isPending}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function ModuleRow({ module, active, onDeleted }: { module: ModuleSummary; active: boolean; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const deleteModule = useMutation({
    mutationFn: () => api.deleteModule(module.slug),
    onSuccess: onDeleted,
  });

  if (confirming) {
    return (
      <div className="nav-item-row nav-item-confirm">
        <span>Delete "{module.name}"?</span>
        <button
          type="button"
          className="danger"
          onClick={() => deleteModule.mutate()}
          disabled={deleteModule.isPending}
        >
          {deleteModule.isPending ? "..." : "Yes"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} disabled={deleteModule.isPending}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className={`nav-item-row${active ? " active" : ""}`}>
      <NavLink className="nav-item" to={`/m/${module.slug}`}>
        {module.name}
      </NavLink>
      <button
        type="button"
        className="nav-item-delete"
        title={`Delete "${module.name}" (leaves any already-generated code untouched)`}
        onClick={() => setConfirming(true)}
      >
        ×
      </button>
    </div>
  );
}

export function NavPanel({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { slug: activeSlug } = useParams<{ slug?: string }>();

  const project = useQuery({ queryKey: ["project"], queryFn: api.getProject });
  const modules = useQuery({ queryKey: ["modules"], queryFn: api.listModules });

  const [modalOpen, setModalOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  const busy = launching || discovering;

  const handleGenerate = async () => {
    const targets = modules.data ?? [];
    if (targets.length === 0) return;
    setLaunching(true);
    try {
      // Each call just opens an interactive terminal and returns -- there's
      // nothing to wait for, so every module's session opens at once.
      await Promise.all(targets.map((mod) => api.generate(mod.slug)));
    } finally {
      setLaunching(false);
    }
  };

  const handleAutodiscover = async () => {
    setDiscovering(true);
    try {
      // This one genuinely runs to completion before resolving -- can take
      // a while, same as any other RPC call here, just a slow one.
      await api.autodiscoverProject();
      void queryClient.invalidateQueries({ queryKey: ["modules"] });
      void queryClient.invalidateQueries({ queryKey: ["root-diagram"] });
    } finally {
      setDiscovering(false);
    }
  };

  if (collapsed) {
    return (
      <nav className="nav-panel collapsed">
        <button className="nav-collapse-toggle" onClick={onToggleCollapse} title="Expand navigation">
          »
        </button>
      </nav>
    );
  }

  return (
    <nav className="nav-panel">
      <div className="nav-profile">
        <div className="nav-profile-row">
          <div className="name" title={project.data?.name}>
            {project.data?.name ?? "..."}
          </div>
          <button className="nav-collapse-toggle" onClick={onToggleCollapse} title="Collapse navigation">
            «
          </button>
        </div>
        <div className="nav-profile-actions">
          <button
            className="primary generate-button"
            onClick={handleGenerate}
            disabled={busy || !modules.data?.length}
            title={
              modules.data?.length
                ? "Opens an interactive agent terminal per module, for you to watch and approve"
                : "Add a module first"
            }
          >
            {launching ? "Opening..." : "Generate code"}
          </button>
          <button
            className="secondary autodiscover-button"
            onClick={handleAutodiscover}
            disabled={busy}
            title="Prompts your coding agent to analyze this workspace's codebase and re-create the project's architecture diagrams in March's own style."
          >
            {discovering ? "Discovering..." : "Autodiscover"}
          </button>
        </div>
        {project.data && <AgentPicker agentBin={project.data.agentBin} />}
      </div>

      <div className="nav-tree">
        <div className="nav-project">
          <NavLink
            className={({ isActive }) => `nav-project-header${isActive ? " active" : ""}`}
            to="/"
            end
          >
            <span className="caret">▾</span>
            <span>Root</span>
          </NavLink>
          <div className="nav-group-children">
            {modules.data?.map((m) => (
              <ModuleRow
                key={m.slug}
                module={m}
                active={m.slug === activeSlug}
                onDeleted={() => {
                  void queryClient.invalidateQueries({ queryKey: ["modules"] });
                  void queryClient.invalidateQueries({ queryKey: ["root-diagram"] });
                  if (m.slug === activeSlug) navigate("/");
                }}
              />
            ))}
            <button className="nav-add" onClick={() => setModalOpen(true)}>
              + new module
            </button>
          </div>
        </div>
      </div>

      {modalOpen && <NewModuleModal onClose={() => setModalOpen(false)} />}
    </nav>
  );
}
