import { describe, expect, it } from "vitest";
import { applyBulkValues, pathParamNames, syncPathParams, visiblePathParams } from "./pathParams";

const p = (key: string, value = "", description = "") => ({ key, value, description });

describe("pathParamNames", () => {
  it("finds single-brace names in the path only, in order, without duplicates", () => {
    expect(pathParamNames("{{baseUrl}}/a/{id}/b/{name}/c/{id}?q={x}#{y}")).toEqual(["id", "name"]);
  });
  it("ignores {{vars}} and the host", () => {
    expect(pathParamNames("https://{tenant}.api.test/{{v}}/x")).toEqual([]);
    expect(pathParamNames("{tenant}.api.test/{id}")).toEqual(["id"]);
  });
});

describe("syncPathParams", () => {
  it("keeps values by name and remembers removed names after the visible rows", () => {
    const prev = [p("id", "7", "user id")];
    const renamed = syncPathParams("/u/{userId}", prev);
    expect(renamed).toEqual([p("userId"), p("id", "7", "user id")]);
    expect(syncPathParams("/u/{id}", renamed)).toEqual([p("id", "7", "user id"), p("userId")]);
  });
});

describe("visiblePathParams", () => {
  it("returns only rows whose names are in the url", () => {
    expect(visiblePathParams("/u/{id}", [p("old", "x"), p("id", "7")])).toEqual([p("id", "7")]);
  });
});

describe("applyBulkValues", () => {
  it("updates values of known names only and keeps descriptions", () => {
    expect(applyBulkValues([p("id", "1", "d"), p("n", "x")], "id: 2\nother: 3\n//n: y")).toEqual([p("id", "2", "d"), p("n", "x")]);
  });
});
