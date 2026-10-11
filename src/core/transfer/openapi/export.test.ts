import { describe, expect, it } from "vitest";
import { emptyCollection, emptyFolder, emptyRequest, emptyWebSocket, type CollectionDoc, type HttpRequestDoc } from "../../model";
import type { Obj } from "../../yaml";
import type { TransferFolder } from "../model";
import { serializeOpenApi, splitServer, toOpenApi } from "./export";
import { importOpenApi } from "./import";

const collection: CollectionDoc = {
  ...emptyCollection("API"),
  auth: { type: "bearer", token: "{{token}}" },
  variables: [{ key: "baseUrl", value: "https://api.test", enabled: true, secret: false }],
};
const get: HttpRequestDoc = {
  ...emptyRequest("Get user"),
  url: "{{baseUrl}}/users/{{id}}?q=1",
  params: [{ key: "q", value: "1", enabled: true }],
};
const post: HttpRequestDoc = {
  ...emptyRequest("Create"),
  method: "POST",
  url: "{{baseUrl}}/users",
  auth: { type: "none" },
  body: { type: "raw", language: "json", content: '{"n":1}' },
};

describe("toOpenApi", () => {
  it("converts servers, path params, tags, bodies and security", () => {
    const { spec } = toOpenApi({ title: "API", collection, items: [{ ...emptyFolder("Users"), items: [get, post] }] });
    expect(spec.openapi).toBe("3.0.3");
    expect(spec.servers).toEqual([{ url: "https://api.test" }]);
    const paths = spec.paths as Record<string, Record<string, Obj>>;
    expect(paths["/users/{id}"].get).toMatchObject({
      tags: ["Users"],
      summary: "Get user",
      parameters: [
        { name: "id", in: "path", required: true },
        { name: "q", in: "query", required: true, example: "1" },
      ],
    });
    expect(paths["/users/{id}"].get.security).toBeUndefined();
    expect(paths["/users"].post.security).toEqual([]);
    expect(paths["/users"].post.requestBody).toEqual({
      content: { "application/json": { schema: { type: "object", properties: { n: { type: "integer" } } }, example: { n: 1 } } },
    });
    expect(spec.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.components).toEqual({ securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } });
  });

  it("skips websocket and duplicate path+method with warnings", () => {
    const { spec, warnings } = toOpenApi({
      title: "API",
      collection,
      items: [get, { ...get, name: "Dup" }, emptyWebSocket("WS"), { ...post, scripts: { pre: "x", post: "" } }],
    });
    expect(Object.keys((spec.paths as Record<string, Obj>)["/users/{id}"])).toEqual(["get"]);
    const all = warnings.join("\n");
    expect(all).toMatch(/Dup/);
    expect(all).toMatch(/WebSocket "WS"/);
    expect(all).toMatch(/scripts/);
  });

  it("unknown server variables become server variables, not values", () => {
    const { spec } = toOpenApi({ title: "x", collection: emptyCollection("x"), items: [{ ...emptyRequest("a"), url: "{{host}}/a" }] });
    expect(spec.servers).toEqual([{ url: "{host}", variables: { host: { default: "" } } }]);
  });

  it("folder auth applies to its requests", () => {
    const folder: TransferFolder = { ...emptyFolder("F"), auth: { type: "apikey", key: "X-Key", value: "", in: "header" }, items: [get] };
    const { spec } = toOpenApi({ title: "x", collection, items: [folder] });
    const op = (spec.paths as Record<string, Record<string, Obj>>)["/users/{id}"].get;
    expect(op.security).toEqual([{ apiKeyAuth: [] }]);
  });

  it("splitServer handles absolute urls and bare paths", () => {
    expect(splitServer("https://h.test:8080/a/b?x=1#f")).toEqual({ server: "https://h.test:8080", path: "/a/b" });
    expect(splitServer("users")).toEqual({ server: "", path: "/users" });
  });

  it("round-trips through importOpenApi", () => {
    const { spec } = toOpenApi({ title: "API", collection, items: [{ ...emptyFolder("Users"), items: [get] }] });
    const plan = importOpenApi(JSON.parse(serializeOpenApi(spec, "json")));
    const r = (plan.items[0] as TransferFolder).items[0] as HttpRequestDoc;
    expect(r).toMatchObject({ name: "Get user", method: "GET", url: "{{baseUrl}}/users/{{id}}?q=1" });
    expect(plan.collection.variables.find((v) => v.key === "baseUrl")?.value).toBe("https://api.test");
  });

  it("yaml output parses back", () => {
    const { spec } = toOpenApi({ title: "API", collection, items: [get] });
    expect(serializeOpenApi(spec, "yaml")).toMatch(/^openapi: 3\.0\.3/);
  });

  it("partial export applies ancestor folder auth and tag", () => {
    const users = { ...emptyFolder("Users"), auth: { type: "apikey", key: "X-Key", value: "", in: "header" } as const };
    const { spec } = toOpenApi({ title: "x", collection: { ...collection, auth: { type: "none" } }, items: [get], ancestors: [emptyFolder("Api"), users] });
    const op = (spec.paths as Record<string, Record<string, Obj>>)["/users/{id}"].get;
    expect(op.tags).toEqual(["Users"]);
    expect(op.security).toEqual([{ apiKeyAuth: [] }]);
  });

  it("warns about collection scripts and dropped file paths, keeps form-data text examples", () => {
    const upload: HttpRequestDoc = {
      ...emptyRequest("Upload"),
      method: "POST",
      url: "{{baseUrl}}/files",
      body: {
        type: "form-data",
        fields: [
          { key: "file", value: "/tmp/a.png", enabled: true, kind: "file" },
          { key: "note", value: "hi", enabled: true, kind: "text" },
        ],
      },
    };
    const { spec, warnings } = toOpenApi({ title: "x", collection: { ...collection, scripts: { pre: "x", post: "" } }, items: [upload] });
    const body = (spec.paths as Record<string, Record<string, Obj>>)["/files"].post.requestBody as Obj;
    expect(body).toMatchObject({ content: { "multipart/form-data": { example: { note: "hi" } } } });
    const all = warnings.join("\n");
    expect(all).toMatch(/Collection "API": scripts/);
    expect(all).toMatch(/file paths are not exported/);
  });
});
