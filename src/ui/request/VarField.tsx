import type { Extension } from "@codemirror/state";
import { CodeEditor } from "../editor/CodeEditor";

/** Labelled single-line input with {{variable}} highlight + completion. A div, not a label: clicks on the text must not steal focus from CodeMirror. */
export function VarField({ label, value, onChange, extensions, placeholder, labelWidth = 120 }: { label: string; value: string; onChange: (v: string) => void; extensions: Extension[]; placeholder?: string; labelWidth?: number }) {
  return (
    <div className="grid items-center gap-3" style={{ gridTemplateColumns: `${labelWidth}px 1fr` }}>
      <span className="text-muted">{label}</span>
      <div className="min-w-0 rounded border border-line bg-elevated">
        <CodeEditor singleLine value={value} placeholder={placeholder} extensions={extensions} onChange={onChange} />
      </div>
    </div>
  );
}
