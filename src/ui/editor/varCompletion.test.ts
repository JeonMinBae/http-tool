import { describe, expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { buildScopes } from "../../core/variables";
import { varCompletion, varCompletionSource } from "./varCompletion";

const v = (key: string, value: string) => ({ key, value, enabled: true, secret: false });
const scopes = buildScopes({ environment: [v("host", "api.dev")], globals: [v("token", "s3cr3t")] });
const run = (doc: string, pos = doc.length, explicit = false) =>
  varCompletionSource(scopes, new Set(["token"]))(new CompletionContext(EditorState.create({ doc }), pos, explicit));

describe("varCompletionSource", () => {
  it("completes names after {{ and closes the braces", () => {
    const r = run("https://{{ho");
    expect(r?.from).toBe("https://{{".length);
    expect(r?.options.map((o) => [o.label, o.apply, o.detail])).toEqual([
      ["host", "host}}", "environment · api.dev"],
      ["token", "token}}", "global · ••••••"],
    ]);
  });

  it("does not repeat closing braces that are already there", () => {
    expect(run("{{ho}}", 4)?.options[0].apply).toBe("host");
  });

  it("replaces the rest of the name when picking in the middle of it", () => {
    const r = run("{{old}}", 3); // cursor after "{{o"
    expect([r?.from, r?.to, r?.options[0].apply]).toEqual([2, 5, "host"]);
  });

  it("stays quiet without {{ unless invoked explicitly", () => {
    expect(run("Bearer ab")).toBeNull();
    const r = run("Bearer ab", 9, true);
    expect(r?.from).toBe(7);
    expect(r?.options[0].apply).toBe("{{host}}");
  });
});

describe("varCompletion", () => {
  it("hands the editor the same source on every lookup", () => {
    const state = EditorState.create({ doc: "{{", extensions: varCompletion(scopes, new Set()) });
    const [a] = state.languageDataAt<unknown>("autocomplete", 2);
    const [b] = state.languageDataAt<unknown>("autocomplete", 2);
    expect(a).toBeTypeOf("function");
    expect(a).toBe(b);
  });
});

describe("list variables", () => {
  const list = { key: "tool", value: "", enabled: true, secret: true, type: "list" as const, items: [{ key: "A", value: "qq", enabled: true }, { key: "B", value: "ww", enabled: true }] };
  const withList = buildScopes({ environment: [v("tool", "plain"), list] });
  const at = (doc: string) => varCompletionSource(withList, new Set(["tool:A", "tool:B"]))(new CompletionContext(EditorState.create({ doc }), doc.length, false));

  it("lists plain names and list items after {{, without the list marker", () => {
    expect(at("{{")?.options.map((o) => o.label)).toEqual(["tool", "tool:A", "tool:B"]);
  });

  it("narrows to item keys after `list:` and inserts only the key", () => {
    const r = at("{{tool:");
    expect(r?.from).toBe("{{tool:".length);
    expect(r?.options.map((o) => [o.label, o.apply, o.detail])).toEqual([
      ["A", "A}}", "environment · ••••••"],
      ["B", "B}}", "environment · ••••••"],
    ]);
  });
});
