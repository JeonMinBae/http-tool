import { describe, expect, it } from "vitest";
import { emptyFolder, emptyRequest, type HttpRequestDoc } from "../model";
import { redactAuth, redactNodes, redactVariables } from "./redact";

describe("redact", () => {
  it("blanks literal credentials but keeps variable references", () => {
    expect(redactAuth({ type: "bearer", token: "abc" })).toEqual({ type: "bearer", token: "" });
    expect(redactAuth({ type: "bearer", token: "{{token}}" })).toEqual({ type: "bearer", token: "{{token}}" });
    expect(redactAuth({ type: "basic", username: "u", password: "p" })).toEqual({ type: "basic", username: "u", password: "" });
  });

  it("redacts nested folder and request auth", () => {
    const req: HttpRequestDoc = { ...emptyRequest("r"), auth: { type: "apikey", key: "X", value: "k", in: "header" } };
    const [folder] = redactNodes([{ ...emptyFolder("f"), auth: { type: "bearer", token: "t" }, items: [req] }]);
    expect(folder.kind === "folder" && folder.auth).toEqual({ type: "bearer", token: "" });
    expect(folder.kind === "folder" && (folder.items[0] as HttpRequestDoc).auth).toMatchObject({ value: "" });
  });

  it("only secret variables are blanked", () => {
    const vars = redactVariables([
      { key: "a", value: "1", enabled: true, secret: false },
      { key: "b", value: "2", enabled: true, secret: true },
    ]);
    expect(vars.map((v) => v.value)).toEqual(["1", ""]);
  });
});
