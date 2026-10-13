import { Decoration, EditorView, hoverTooltip, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from "@uiw/react-codemirror";
import { RangeSetBuilder } from "@codemirror/state";
import { resolveVar, varSource, type VarScopes } from "../../core/variables";

const resolved = Decoration.mark({ class: "cm-var cm-var-ok" });
const missing = Decoration.mark({ class: "cm-var cm-var-missing" });
const PATTERN = /\{\{\s*([^{}\s]+)\s*\}\}/g;

const theme = EditorView.baseTheme({
  ".cm-var": { borderRadius: "3px", padding: "0 1px" },
  ".cm-var-ok": { color: "var(--ok)", backgroundColor: "color-mix(in srgb, var(--ok) 12%, transparent)" },
  ".cm-var-missing": { color: "var(--danger)", backgroundColor: "color-mix(in srgb, var(--danger) 12%, transparent)" },
  ".cm-var-tip": { padding: "4px 8px", fontSize: "12px", maxWidth: "420px", wordBreak: "break-all" },
});

/** Highlights {{variables}} (green when resolvable, red otherwise) and shows value + scope on hover. */
export function varHighlight(scopes: VarScopes, secrets: Set<string>) {
  const decorator = new MatchDecorator({
    regexp: PATTERN,
    decoration: (m) => (resolveVar(m[1], scopes) === undefined ? missing : resolved),
  });
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view);
      }
      update(u: ViewUpdate) {
        this.decorations = u.docChanged || u.viewportChanged ? decorator.updateDeco(u, this.decorations) : this.decorations;
      }
    },
    { decorations: (v) => v.decorations ?? new RangeSetBuilder<Decoration>().finish() },
  );
  const tooltip = hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos);
    for (const m of line.text.matchAll(PATTERN)) {
      const from = line.from + (m.index ?? 0);
      const to = from + m[0].length;
      if (pos < from || pos > to) continue;
      const name = m[1];
      const scope = varSource(name, scopes);
      const value = resolveVar(name, scopes);
      return {
        pos: from,
        end: to,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "cm-var-tip";
          dom.textContent =
            value === undefined ? `${name}: not defined` : `${name} (${scope}): ${secrets.has(name) ? "••••••" : value}`;
          return { dom };
        },
      };
    }
    return null;
  });
  return [theme, plugin, tooltip];
}

