import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { splitListRef, visibleVars, type VarScopes } from "../../core/variables";

/** Text after an unclosed `{{` (spaces allowed) up to the cursor; null when not inside one. */
export function matchVarPrefix(before: string): { prefix: string; offset: number } | null {
  const m = before.match(/\{\{\s*([^{}\s]*)$/);
  return m ? { prefix: m[1], offset: before.length - m[1].length } : null;
}

/** `tool:` narrows to that list's keys (labels are keys); otherwise every visible name. */
export function varOptions(prefix: string, scopes: VarScopes, secrets: Set<string>) {
  const ref = splitListRef(prefix);
  const vars = visibleVars(scopes).filter((x) => (ref ? x.name.startsWith(`${ref.list}:`) : true));
  return {
    skip: ref ? ref.list.length + 1 : 0,
    options: vars.map((x) => ({
      label: ref ? x.name.slice(ref.list.length + 1) : x.name,
      detail: `${x.scope}: ${secrets.has(x.name) ? "••••••" : x.value}`,
      type: "variable",
    })),
  };
}

export function varCompletion(scopes: VarScopes, secrets: Set<string>) {
  const source = (ctx: CompletionContext): CompletionResult | null => {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const hit = matchVarPrefix(line.text.slice(0, ctx.pos - line.from));
    if (!hit) return null;
    const { skip, options } = varOptions(hit.prefix, scopes, secrets);
    const closed = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2) === "}}";
    return {
      from: line.from + hit.offset + skip,
      options: options.map((o) => ({ ...o, apply: closed ? o.label : `${o.label}}}` })),
      validFor: /^[^{}\s:]*$/,
    };
  };
  return [autocompletion(), EditorState.languageData.of(() => [{ autocomplete: source }])];
}
