import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Modal } from "../components/Modal";
import { Select } from "../components/Select";
import { languagesForKind, type LanguageId, type ModuleKind } from "@march/spec-schema";

export function NewModuleModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<ModuleKind>("backend");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState<LanguageId | "">("");
  const languages = languagesForKind(kind);

  const createModule = useMutation({
    mutationFn: () => api.createModule({ name, description, kind, language: language as LanguageId }),
    onSuccess: (module) => {
      queryClient.invalidateQueries({ queryKey: ["modules"] });
      navigate(`/m/${module.slug}`);
      onClose();
    },
  });

  const canSubmit = name.trim() && language;

  const changeKind = (next: ModuleKind) => {
    setKind(next);
    // The previous language choice almost certainly isn't valid for the
    // other kind's list (a backend "rust" pick makes no sense once you
    // switch to frontend) -- clear it rather than silently keep a value the
    // Select would just fall back to showing as raw/unrecognized text.
    setLanguage("");
  };

  return (
    <Modal onClose={onClose}>
      <h3>New module</h3>

      {createModule.isError && <div className="error-banner">{(createModule.error as Error).message}</div>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          createModule.mutate();
        }}
      >
        <div className="form-row">
          <label>Kind</label>
          <div className="modal-tabs">
            <button type="button" className={kind === "backend" ? "active" : ""} onClick={() => changeKind("backend")}>
              Backend
            </button>
            <button
              type="button"
              className={kind === "frontend" ? "active" : ""}
              onClick={() => changeKind("frontend")}
            >
              Frontend
            </button>
          </div>
        </div>
        <div className="form-row">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. UserService" autoFocus />
        </div>
        <div className="form-row">
          <label>Description (optional)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="form-row">
          <label>{kind === "frontend" ? "Framework" : "Language"} -- this module's code will be written in it</label>
          <Select
            value={language}
            onChange={(v) => setLanguage(v as LanguageId)}
            options={[
              ...(!language ? [{ value: "", label: kind === "frontend" ? "Select a framework" : "Select a language" }] : []),
              ...languages.map((l) => ({ value: l.id as string, label: `${l.icon} ${l.label}` })),
            ]}
          />
        </div>
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={!canSubmit || createModule.isPending}>
            Create module
          </button>
        </div>
      </form>
    </Modal>
  );
}
