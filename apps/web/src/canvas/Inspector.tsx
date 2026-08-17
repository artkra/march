import { track, useValue, type Editor, type TLArrowShape } from "tldraw";
import {
  EDGE_TYPES,
  EDGE_TYPE_LABELS,
  EDGE_LABEL_LOOKUP,
  FIELD_TYPES,
  STORAGE_TYPES,
  QUEUE_TYPES,
  type Field,
  type FieldType,
  type Method,
  type SpecNode,
} from "@march/spec-schema";
import type { NodeShape } from "./nodeShapes";
import { NODE_META } from "./nodeShapes";
import { Select } from "../components/Select";

function FieldListEditor({ fields, onChange }: { fields: Field[]; onChange: (fields: Field[]) => void }) {
  const update = (i: number, patch: Partial<Field>) => {
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  };
  return (
    <div className="field-list">
      {fields.map((f, i) => (
        <div className="field-row" key={i}>
          <input
            type="text"
            value={f.name}
            placeholder="name"
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <Select
            compact
            value={f.fieldType}
            onChange={(v) => update(i, { fieldType: v as FieldType })}
            options={FIELD_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <label title="required">
            <input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} /> req
          </label>
          <label title="unique">
            <input type="checkbox" checked={f.unique} onChange={(e) => update(i, { unique: e.target.checked })} /> uniq
          </label>
          <button type="button" onClick={() => onChange(fields.filter((_, idx) => idx !== i))}>
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...fields, { name: "", fieldType: "string", required: false, unique: false }])}
      >
        + field
      </button>
    </div>
  );
}

function MethodListEditor({ methods, onChange }: { methods: Method[]; onChange: (methods: Method[]) => void }) {
  const update = (i: number, patch: Partial<Method>) => {
    onChange(methods.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  };
  return (
    <div className="field-list">
      {methods.map((m, i) => (
        <div key={i}>
          <div className="method-row">
            <input
              type="text"
              value={m.name}
              placeholder="methodName"
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <input
              type="text"
              value={m.returnType}
              placeholder="return type"
              onChange={(e) => update(i, { returnType: e.target.value })}
            />
            <button type="button" onClick={() => onChange(methods.filter((_, idx) => idx !== i))}>
              ×
            </button>
          </div>
          <div className="method-params">
            {m.params.map((p, pi) => (
              <span key={pi} style={{ display: "inline-flex", gap: 2 }}>
                <input
                  type="text"
                  value={p.name}
                  placeholder="param"
                  style={{ width: 60 }}
                  onChange={(e) =>
                    update(i, {
                      params: m.params.map((pp, ppi) => (ppi === pi ? { ...pp, name: e.target.value } : pp)),
                    })
                  }
                />
                <input
                  type="text"
                  value={p.paramType}
                  placeholder="type"
                  style={{ width: 50 }}
                  onChange={(e) =>
                    update(i, {
                      params: m.params.map((pp, ppi) => (ppi === pi ? { ...pp, paramType: e.target.value } : pp)),
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() => update(i, { params: m.params.filter((_, ppi) => ppi !== pi) })}
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => update(i, { params: [...m.params, { name: "", paramType: "" }] })}
            >
              + param
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...methods, { name: "", params: [], returnType: "" }])}>
        + method
      </button>
    </div>
  );
}

function NodeTypeFields({ node, onChange }: { node: SpecNode; onChange: (node: SpecNode) => void }) {
  switch (node.type) {
    case "entity":
    case "input":
    case "output":
    case "store":
      return (
        <>
          <div className="form-row">
            <label>Name</label>
            <input value={node.name} onChange={(e) => onChange({ ...node, name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>{node.type === "store" ? "State" : "Fields"}</label>
            <FieldListEditor fields={node.fields} onChange={(fields) => onChange({ ...node, fields })} />
          </div>
        </>
      );
    case "component":
      return (
        <>
          <div className="form-row">
            <label>Name</label>
            <input value={node.name} onChange={(e) => onChange({ ...node, name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Props</label>
            <FieldListEditor fields={node.props} onChange={(props) => onChange({ ...node, props })} />
          </div>
        </>
      );
    case "page":
      return (
        <>
          <div className="form-row">
            <label>Name</label>
            <input value={node.name} onChange={(e) => onChange({ ...node, name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Route path</label>
            <input value={node.path} onChange={(e) => onChange({ ...node, path: e.target.value })} placeholder="/" />
          </div>
        </>
      );
    case "api_client":
      return (
        <>
          <div className="form-row">
            <label>Name</label>
            <input value={node.name} onChange={(e) => onChange({ ...node, name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Base URL (optional)</label>
            <input
              value={node.baseUrl}
              onChange={(e) => onChange({ ...node, baseUrl: e.target.value })}
              placeholder="e.g. https://api.example.com"
            />
          </div>
          <div className="form-row">
            <label>Notes</label>
            <textarea rows={4} value={node.notes} onChange={(e) => onChange({ ...node, notes: e.target.value })} />
          </div>
        </>
      );
    case "interface":
      return (
        <>
          <div className="form-row">
            <label>Name</label>
            <input value={node.name} onChange={(e) => onChange({ ...node, name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Methods</label>
            <MethodListEditor methods={node.methods} onChange={(methods) => onChange({ ...node, methods })} />
          </div>
        </>
      );
    case "database":
      return (
        <>
          <div className="form-row">
            <label>Name</label>
            <input value={node.name} onChange={(e) => onChange({ ...node, name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Storage type</label>
            <Select
              value={node.storageType}
              onChange={(v) => onChange({ ...node, storageType: v as typeof node.storageType })}
              options={STORAGE_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </div>
        </>
      );
    case "queue":
      return (
        <>
          <div className="form-row">
            <label>Name</label>
            <input value={node.name} onChange={(e) => onChange({ ...node, name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Queue type</label>
            <Select
              value={node.queueType}
              onChange={(v) => onChange({ ...node, queueType: v as typeof node.queueType })}
              options={QUEUE_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </div>
        </>
      );
    case "endpoint":
      return (
        <>
          <div className="form-row">
            <label>Method</label>
            <Select
              value={node.method}
              onChange={(v) => onChange({ ...node, method: v as typeof node.method })}
              options={["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ value: m, label: m }))}
            />
          </div>
          <div className="form-row">
            <label>Path</label>
            <input value={node.path} onChange={(e) => onChange({ ...node, path: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Auth</label>
            <Select
              value={node.auth}
              onChange={(v) => onChange({ ...node, auth: v as "none" | "required" })}
              options={[
                { value: "none", label: "none" },
                { value: "required", label: "required" },
              ]}
            />
          </div>
          <div className="form-row">
            <label>Behavior (free text -- the agent fills gaps here)</label>
            <textarea
              rows={5}
              value={node.behavior}
              onChange={(e) => onChange({ ...node, behavior: e.target.value })}
            />
          </div>
          <p className="meta" style={{ fontSize: 11 }}>
            Request/response shape: connect an Input/Output node with an arrow, or leave unset for the
            agent to infer from behavior.
          </p>
        </>
      );
    case "implementation":
      return (
        <>
          <div className="form-row">
            <label>Name</label>
            <input value={node.name} onChange={(e) => onChange({ ...node, name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Notes (folded into the connected endpoint's behavior on export)</label>
            <textarea rows={5} value={node.notes} onChange={(e) => onChange({ ...node, notes: e.target.value })} />
          </div>
        </>
      );
    case "external":
      return (
        <>
          <div className="form-row">
            <label>Name</label>
            <input value={node.name} onChange={(e) => onChange({ ...node, name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Notes</label>
            <textarea rows={4} value={node.notes} onChange={(e) => onChange({ ...node, notes: e.target.value })} />
          </div>
        </>
      );
    default:
      return null;
  }
}

function NodeForm({ node, onChange }: { node: SpecNode; onChange: (node: SpecNode) => void }) {
  return (
    <>
      <NodeTypeFields node={node} onChange={onChange} />
      <div className="form-row">
        <label>Comment</label>
        <textarea
          rows={3}
          value={node.comment}
          placeholder="Notes for yourself or the agent..."
          onChange={(e) => onChange({ ...node, comment: e.target.value })}
        />
      </div>
    </>
  );
}

function EdgeForm({ shape, editor }: { shape: TLArrowShape; editor: Editor }) {
  const text = shape.props.text ?? "";
  const known = EDGE_LABEL_LOOKUP[text.trim().toLowerCase()];
  const selectValue = text.trim() === "" ? "association" : known ?? "custom";

  const setText = (value: string) => {
    editor.updateShape({ id: shape.id, type: "arrow", props: { text: value } });
  };

  return (
    <>
      <div className="form-row">
        <label>Relationship type</label>
        <Select
          value={selectValue}
          onChange={(value) => {
            if (value === "custom") return;
            setText(EDGE_TYPE_LABELS[value as keyof typeof EDGE_TYPE_LABELS]);
          }}
          options={EDGE_TYPES.map((t) => ({ value: t, label: EDGE_TYPE_LABELS[t] }))}
        />
      </div>
      <div className="form-row">
        <label>Label (shown on the arrow -- edit freely for a custom relationship)</label>
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="actions">
        <button type="button" onClick={() => editor.deleteShape(shape.id)}>
          Delete connection
        </button>
      </div>
    </>
  );
}

type Selection = { kind: "node"; shape: NodeShape } | { kind: "edge"; shape: TLArrowShape } | null;

const POPOVER_WIDTH = 300;
const MARGIN = 12;

/**
 * Anchors the popover near the selected shape's top-right corner in screen
 * space, flipping to the left when that would overflow the window, so it
 * pops up next to whatever you clicked instead of living in a fixed column.
 * `pageToScreen` returns raw viewport-relative coordinates (same space as
 * the `clientX`/`clientY` fed into `screenToPage` elsewhere), so these are
 * used directly as `position: fixed` left/top with no container offsetting.
 */
function computePopoverPosition(editor: Editor, shapeId: NodeShape["id"] | TLArrowShape["id"]) {
  const bounds = editor.getShapePageBounds(shapeId);
  if (!bounds) return { left: MARGIN, top: MARGIN };

  const topRight = editor.pageToScreen({ x: bounds.maxX, y: bounds.minY });
  let left = topRight.x + MARGIN;
  if (left + POPOVER_WIDTH + MARGIN > window.innerWidth) {
    const topLeft = editor.pageToScreen({ x: bounds.minX, y: bounds.minY });
    left = topLeft.x - POPOVER_WIDTH - MARGIN;
  }
  left = Math.min(Math.max(MARGIN, left), window.innerWidth - POPOVER_WIDTH - MARGIN);
  const top = Math.min(Math.max(MARGIN, topRight.y), window.innerHeight - MARGIN);

  return { left, top };
}

export const Inspector = track(function Inspector({ editor }: { editor: Editor }) {
  const selection = useValue<Selection>(
    "selection",
    () => {
      const shapes = editor.getSelectedShapes();
      if (shapes.length !== 1) return null;
      const shape = shapes[0];
      if (shape.type === "arrow") return { kind: "edge", shape: shape as TLArrowShape };
      if (typeof shape.props === "object" && shape.props && "node" in shape.props) {
        return { kind: "node", shape: shape as NodeShape };
      }
      return null;
    },
    [editor],
  );

  if (!selection) return null;

  const { left, top } = computePopoverPosition(editor, selection.shape.id);
  const close = () => editor.setSelectedShapes([]);

  if (selection.kind === "edge") {
    return (
      <div className="inspector-popover" style={{ left, top }}>
        <div className="inspector-popover-header">
          <h3>Connection</h3>
          <button className="inspector-popover-close" onClick={close} title="Close">
            ×
          </button>
        </div>
        <EdgeForm shape={selection.shape} editor={editor} />
      </div>
    );
  }

  const selected = selection.shape;
  const meta = NODE_META[selected.type as SpecNode["type"]];
  const node = selected.props.node;

  return (
    <div className="inspector-popover" style={{ left, top }}>
      <div className="inspector-popover-header">
        <h3 style={{ color: meta.color }}>
          {meta.icon} {meta.label}
        </h3>
        <button className="inspector-popover-close" onClick={close} title="Close">
          ×
        </button>
      </div>
      <NodeForm
        node={node}
        onChange={(next) => {
          editor.updateShape({ id: selected.id, type: selected.type, props: { ...selected.props, node: next } });
        }}
      />
      <div className="actions">
        <button
          type="button"
          onClick={() => {
            editor.deleteShape(selected.id);
          }}
        >
          Delete node
        </button>
      </div>
    </div>
  );
});
