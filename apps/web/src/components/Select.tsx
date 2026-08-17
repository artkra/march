import { useEffect, useRef, useState, type ReactNode } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
}

/**
 * A dropdown built from plain DOM elements instead of a native <select>.
 * Native <select> popups render as an OS-level overlay, and that rendering
 * path is unreliable inside VS Code's (nested, sandboxed) webview -- clicks
 * don't reliably open the list at all. This sidesteps it entirely.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  className,
  compact,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);
  const classes = ["select", compact && "compact", className].filter(Boolean).join(" ");

  return (
    <div className={classes} ref={rootRef}>
      <button type="button" className="select-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="select-trigger-label">{current?.label ?? value}</span>
        <span className="select-caret">▾</span>
      </button>
      {open && (
        <div className="select-menu">
          {options.map((o) => (
            <div
              key={o.value}
              className={`select-option${o.value === value ? " selected" : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
