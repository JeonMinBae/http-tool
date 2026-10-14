import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { splitListRef, visibleVars, type VarScopes, type VisibleVar } from "../../core/variables";

// "{{" plus an optional partial name right before the cursor; group 1 is the partial name.
const OPEN = /\{\{\s*([^{}\s]*)$/;
// ':' is excluded so typing `tool:` re-queries and narrows to that list's keys.
const NAME = /^[^{}\s:]*$/;
const REST = /^[^{}\s]*/;
// Closing braces right after the name; `{{ name }}` style spacing is allowed.
const CLOSE = /^\s*\}\}/;
const MASK = "••••••";
const clip = (s: string) => (s.length > 40 ? `${s.slice(0, 40)}…` : s);

export function varCompletionSource(scopes: VarScopes, secrets: Set<string>) {
  const vars = visibleVars(scopes);
  const option = (v: VisibleVar, label: string, apply: string): Completion => ({
    label,
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
      // `{{tool:` lists only that list's item keys, labelled and inserted without the `tool:` prefix.
      const ref = splitListRef(open[1]);
      const skip = ref ? ref.list.length + 1 : 0;
      const shown = ref ? vars.filter((v) => v.name.startsWith(`${ref.list}:`)) : vars;
      const options = shown.map((v) => {
        const label = v.name.slice(skip);
        return option(v, label, closed ? label : `${label}}}`);
      });
      return { from: ctx.pos - open[1].length + skip, to, options, validFor: NAME };
    }
    if (!ctx.explicit) return null;
    const word = ctx.matchBefore(/[^{}\s]*/);
    return { from: word?.from ?? ctx.pos, to, options: vars.map((v) => option(v, v.name, `{{${v.name}}}`)), validFor: NAME };
  };
}

/** `{{` completion on top of whatever language completions the editor already has. */
export function varCompletion(scopes: VarScopes, secrets: Set<string>) {
  return [autocompletion(), EditorState.languageData.of(() => [{ autocomplete: varCompletionSource(scopes, secrets) }])];
}
