import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { listVars, type VarScopes, type VisibleVar } from "../../core/variables";

// "{{" plus an optional partial name right before the cursor; group 1 is the partial name.
const OPEN = /\{\{\s*([^{}\s]*)$/;
const NAME = /^[^{}\s]*$/;
const REST = /^[^{}\s]*/;
// Closing braces right after the name; `{{ name }}` style spacing is allowed.
const CLOSE = /^\s*\}\}/;
const MASK = "••••••";
const clip = (s: string) => (s.length > 40 ? `${s.slice(0, 40)}…` : s);

export function varCompletionSource(scopes: VarScopes, secrets: Set<string>) {
  const vars = listVars(scopes);
  const option = (v: VisibleVar, apply: string): Completion => ({
    label: v.name,
    apply,
    type: "variable",
    detail: `${v.scope} · ${secrets.has(v.name) ? MASK : clip(v.value)}`,
  });
  return (ctx: CompletionContext): CompletionResult | null => {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const after = line.text.slice(ctx.pos - line.from);
    // Picking in the middle of a name replaces the rest of it too, e.g. `{{o|ld}}` → `{{host}}`.
    const to = ctx.pos + (REST.exec(after)?.[0].length ?? 0);
    const open = OPEN.exec(line.text.slice(0, ctx.pos - line.from));
    if (open) {
      const closed = CLOSE.test(ctx.state.sliceDoc(to, line.to));
      return { from: ctx.pos - open[1].length, to, options: vars.map((v) => option(v, closed ? v.name : `${v.name}}}`)), validFor: NAME };
    }
    if (!ctx.explicit) return null;
    const word = ctx.matchBefore(/[^{}\s]*/);
    return { from: word?.from ?? ctx.pos, to, options: vars.map((v) => option(v, `{{${v.name}}}`)), validFor: NAME };
  };
}

/** `{{` completion on top of whatever language completions the editor already has. */
export function varCompletion(scopes: VarScopes, secrets: Set<string>) {
  return [autocompletion(), EditorState.languageData.of(() => [{ autocomplete: varCompletionSource(scopes, secrets) }])];
}
