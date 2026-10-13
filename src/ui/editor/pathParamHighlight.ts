import { Decoration, EditorView, hoverTooltip, ViewPlugin, type DecorationSet, type ViewUpdate } from "@uiw/react-codemirror";
import { RangeSetBuilder } from "@codemirror/state";
import type { PathParam } from "../../core/model";
import { pathParamSpans } from "../../core/pathParams";

const filled = Decoration.mark({ class: "cm-path cm-path-ok" });
const empty = Decoration.mark({ class: "cm-path cm-path-empty" });

const theme = EditorView.baseTheme({
  ".cm-path": { borderRadius: "3px", padding: "0 1px" },
  ".cm-path-ok": { color: "var(--accent)", backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)" },
  ".cm-path-empty": { color: "var(--warn)", backgroundColor: "color-mix(in srgb, var(--warn) 12%, transparent)" },
  ".cm-path-tip": { padding: "4px 8px", fontSize: "12px", maxWidth: "420px", wordBreak: "break-all" },
});

/** Colors `{name}` in the URL path (never `{{var}}`): accent when a value is set, warn when empty. */
export function pathParamHighlight(rows: PathParam[]) {
  const valueOf = (name: string) => rows.find((r) => r.key === name)?.value ?? "";
  const build = (url: string): DecorationSet => {
    const b = new RangeSetBuilder<Decoration>();
    for (const s of pathParamSpans(url)) b.add(s.from, s.to, valueOf(s.name) === "" ? empty : filled);
    return b.finish();
  };
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view.state.doc.toString());
      }
      update(u: ViewUpdate) {
        if (u.docChanged) this.decorations = build(u.state.doc.toString());
      }
    },
    { decorations: (v) => v.decorations },
  );
  const tooltip = hoverTooltip((view, pos) => {
    const s = pathParamSpans(view.state.doc.toString()).find((x) => pos >= x.from && pos <= x.to);
    if (!s) return null;
    const value = valueOf(s.name);
    return {
      pos: s.from,
      end: s.to,
      above: true,
      create() {
        const dom = document.createElement("div");
        dom.className = "cm-path-tip";
        dom.textContent = `${s.name}: ${value === "" ? "empty" : value}`;
        return { dom };
      },
    };
  });
  return [theme, plugin, tooltip];
}
