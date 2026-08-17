import { BaseBoxShapeUtil, HTMLContainer, T, resizeBox } from "tldraw";
import type { TLBaseShape, TLResizeInfo } from "tldraw";
import { BACKEND_LANGUAGES, FRONTEND_LANGUAGES } from "@march/spec-schema";

const ALL_LANGUAGES = [...BACKEND_LANGUAGES, ...FRONTEND_LANGUAGES];

export interface ModuleRefShapeProps {
  w: number;
  h: number;
  moduleSlug: string;
  label: string;
  language: string;
}

export type ModuleRefShape = TLBaseShape<"module_ref", ModuleRefShapeProps>;

/** Navigation is wired up by ProjectRootCanvas stashing a callback on the editor instance. */
export type MarchNavigableEditor = { __marchNavigate?: (moduleSlug: string) => void };

function languageDisplay(id: string): string {
  const lang = ALL_LANGUAGES.find((l) => l.id === id);
  return lang ? `${lang.icon} ${lang.label}` : id;
}

export class ModuleRefShapeUtil extends BaseBoxShapeUtil<ModuleRefShape> {
  static override type = "module_ref" as const;
  static override props = {
    w: T.number,
    h: T.number,
    moduleSlug: T.string,
    label: T.string,
    language: T.string,
  };

  override getDefaultProps(): ModuleRefShapeProps {
    return { w: 200, h: 84, moduleSlug: "", label: "Module", language: "" };
  }

  override onResize = (shape: ModuleRefShape, info: TLResizeInfo<ModuleRefShape>) => {
    return resizeBox(shape, info);
  };

  override onDoubleClick = (shape: ModuleRefShape) => {
    (this.editor as unknown as MarchNavigableEditor).__marchNavigate?.(shape.props.moduleSlug);
  };

  override component(shape: ModuleRefShape) {
    return (
      <HTMLContainer
        style={{
          width: shape.props.w,
          height: shape.props.h,
          border: "2px solid var(--accent-2, #00f0ff)",
          borderRadius: 10,
          background: "var(--color-panel, white)",
          padding: "10px 12px",
          pointerEvents: "all",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 4,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14 }}>{shape.props.label}</div>
        <div style={{ fontSize: 10, opacity: 0.6 }}>{languageDisplay(shape.props.language)}</div>
        <div style={{ fontSize: 10, opacity: 0.5, fontStyle: "italic" }}>double-click to open</div>
      </HTMLContainer>
    );
  }

  override indicator(shape: ModuleRefShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} />;
  }
}
