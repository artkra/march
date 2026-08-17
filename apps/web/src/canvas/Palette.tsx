import { Link } from "react-router-dom";
import { NODE_META } from "./nodeShapes";
import { HAND_DRAW_MAP, type HandDrawShape } from "./shapeClassifier";
import { Select } from "../components/Select";
import { languagesForKind, nodeTypesForKind, type LanguageId, type ModuleKind, type NodeType } from "@march/spec-schema";

export const PALETTE_DRAG_MIME = "application/x-march-node-type";

const SHAPE_HINTS: Record<HandDrawShape, { glyph: string; how: string }> = {
  rectangle: { glyph: "▭", how: "a box, 4 square corners" },
  square: { glyph: "◻", how: "a box about as tall as it is wide" },
  circle: { glyph: "○", how: "a round loop" },
  triangle: { glyph: "△", how: "3 corners" },
  diamond: { glyph: "◇", how: "a box rotated 45°" },
  swirl: { glyph: "🌀", how: "a spiral, wind around 1.5+ times" },
  v: { glyph: "V", how: "down then up, one open stroke, point facing down" },
  lambda: { glyph: "Λ", how: "up then down, one open stroke, point facing up" },
  e: { glyph: "e", how: "an open loop, like a cursive e -- almost a full circle, but don't close it" },
};

export function Palette({
  backTo,
  moduleName,
  moduleKind,
  language,
  onLanguageChange,
}: {
  backTo: string;
  moduleName: string;
  moduleKind: ModuleKind;
  language: string;
  onLanguageChange: (language: LanguageId) => void;
}) {
  const languages = languagesForKind(moduleKind);
  const knownLanguage = languages.some((l) => l.id === language);
  const nodeTypes = nodeTypesForKind(moduleKind);
  const drawableShapes = Object.keys(HAND_DRAW_MAP[moduleKind]) as HandDrawShape[];

  return (
    <div className="palette">
      <Link className="palette-back" to={backTo}>
        ← back to project
      </Link>

      <div className="module-header">
        <div className="module-header-name" title={moduleName}>
          {moduleName}
        </div>
        <Select
          value={language}
          onChange={(v) => onLanguageChange(v as LanguageId)}
          options={[
            ...(!knownLanguage && language ? [{ value: language, label: `${language} (legacy)` }] : []),
            ...languages.map((l) => ({ value: l.id as string, label: `${l.icon} ${l.label}` })),
          ]}
        />
      </div>

      <h3>Drag onto canvas</h3>
      {nodeTypes.map((type: NodeType) => {
        const meta = NODE_META[type];
        return (
          <div
            key={type}
            className="palette-item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(PALETTE_DRAG_MIME, type);
              e.dataTransfer.effectAllowed = "copy";
            }}
          >
            <span style={{ color: meta.color }}>{meta.icon}</span>
            <span>{meta.label}</span>
          </div>
        );
      })}

      {drawableShapes.length > 0 && (
        <>
          <h3>Or hand-draw</h3>
          <p className="palette-hint-intro">
            Draw tool (key <kbd>D</kbd>) -- sketch a shape and it's swapped for a typed node automatically.
            {moduleKind === "frontend"
              ? " Only some node types have a shape yet:"
              : " Every node type has its own shape:"}
          </p>
          <div className="shape-hints">
            {drawableShapes.map((shape) => {
              const nodeType = HAND_DRAW_MAP[moduleKind][shape];
              if (!nodeType) return null;
              const meta = NODE_META[nodeType];
              const hint = SHAPE_HINTS[shape];
              return (
                <div className="shape-hint" key={shape}>
                  <div className="shape-hint-glyph">{hint.glyph}</div>
                  <div className="shape-hint-body">
                    <div className="shape-hint-target" style={{ color: meta.color }}>
                      <span>{meta.icon}</span>
                      <span>{meta.label}</span>
                    </div>
                    <div className="shape-hint-how">{hint.how}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
