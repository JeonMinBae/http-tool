import { describe, expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { buildScopes } from "../../core/variables";
import { varCompletionSource } from "./varCompletion";

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

  it("stays quiet without {{ unless invoked explicitly", () => {
    expect(run("Bearer ab")).toBeNull();
    const r = run("Bearer ab", 9, true);
    expect(r?.from).toBe(7);
    expect(r?.options[0].apply).toBe("{{host}}");
  });
});
