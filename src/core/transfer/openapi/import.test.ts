import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { HttpRequestDoc } from "../../model";
import type { TransferFolder } from "../model";
import { importOpenApi } from "./import";

const SPEC = parse(`
openapi: 3.0.3
info: { title: Pets }
servers: [{ url: "https://{env}.api.test/v1/", variables: { env: { default: prod } } }]
security: [{ bearer: [] }]
tags: [{ name: pets }]
paths:
  /pets/{petId}:
    parameters: [{ name: petId, in: path, required: true, schema: { type: integer, example: 42 } }]
    get:
      tags: [pets, other]
      operationId: getPet
      parameters:
        - { name: verbose, in: query, schema: { type: boolean } }
        - { name: X-Trace, in: header, required: true, example: abc }
    put:
      summary: Update pet
      tags: [pets]
      security: [{ key: [] }]
      requestBody:
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Pet" }
  /health:
    get: { security: [] }
components:
  securitySchemes:
    bearer: { type: http, scheme: bearer }
    key: { type: apiKey, in: header, name: X-Key }
  schemas:
    Pet: { type: object, properties: { name: { type: string, example: Rex } } }
`);

describe("importOpenApi", () => {
  it("maps servers, tags, names and path params", () => {
    const plan = importOpenApi(SPEC);
    expect(plan.collection.name).toBe("Pets");
    expect(plan.collection.variables.find((v) => v.key === "baseUrl")?.value).toBe("https://prod.api.test/v1");
    expect(plan.collection.variables.find((v) => v.key === "petId")?.value).toBe("42");
    const folder = plan.items[0] as TransferFolder;
    expect(folder.name).toBe("pets");
    const [get, put] = folder.items as HttpRequestDoc[];
    expect(get.name).toBe("getPet");
    expect(get.url).toBe("{{baseUrl}}/pets/{{petId}}");
    expect(get.params).toEqual([{ key: "verbose", value: "true", enabled: false }]);
    expect(get.headers).toEqual([{ key: "X-Trace", value: "abc", enabled: true }]);
    expect(put.name).toBe("Update pet");
    expect(put.body).toEqual({ type: "raw", language: "json", content: '{\n  "name": "Rex"\n}' });
    expect((plan.items[1] as HttpRequestDoc).name).toBe("GET /health");
  });

  it("maps security to collection and request auth", () => {
    const plan = importOpenApi(SPEC);
    expect(plan.collection.auth).toEqual({ type: "bearer", token: "{{token}}" });
    const [get, put] = (plan.items[0] as TransferFolder).items as HttpRequestDoc[];
    expect(get.auth).toEqual({ type: "inherit" });
    expect(put.auth).toEqual({ type: "apikey", key: "X-Key", value: "{{apiKey}}", in: "header" });
    expect((plan.items[1] as HttpRequestDoc).auth).toEqual({ type: "none" });
    expect(plan.collection.variables.find((v) => v.key === "token")).toMatchObject({ secret: true, value: "" });
  });

  it("enabled query params go into the url", () => {
    const plan = importOpenApi({
      openapi: "3.0.0",
      info: {},
      servers: [{ url: "http://h" }],
      paths: { "/s": { get: { parameters: [{ name: "q", in: "query", required: true, example: "x" }] } } },
    });
    expect((plan.items[0] as HttpRequestDoc).url).toBe("{{baseUrl}}/s?q=x");
  });

  it("warns on unsupported security and missing servers", () => {
    const plan = importOpenApi({
      openapi: "3.1.0",
      info: { title: "x" },
      security: [{ oidc: [] }],
      components: { securitySchemes: { oidc: { type: "openIdConnect" } } },
      paths: {},
    });
    expect(plan.warnings.join("\n")).toMatch(/No servers/);
    expect(plan.warnings.join("\n")).toMatch(/oidc/);
    expect(plan.collection.auth).toEqual({ type: "none" });
  });

  it("maps oauth2 client credentials with scopes", () => {
    const plan = importOpenApi({
      openapi: "3.0.0",
      info: {},
      security: [{ o: ["read", "write"] }],
      components: { securitySchemes: { o: { type: "oauth2", flows: { clientCredentials: { tokenUrl: "https://t", scopes: {} } } } } },
      paths: {},
    });
    expect(plan.collection.auth).toMatchObject({ type: "oauth2", grant: "client_credentials", tokenUrl: "https://t", scope: "read write" });
  });

  it("multipart binary property becomes a file field", () => {
    const plan = importOpenApi({
      openapi: "3.0.0",
      info: {},
      paths: {
        "/up": {
          post: {
            requestBody: {
              content: {
                "multipart/form-data": {
                  schema: { properties: { file: { type: "string", format: "binary" }, note: { type: "string" } } },
                },
              },
            },
          },
        },
      },
    });
    expect((plan.items[0] as HttpRequestDoc).body).toEqual({
      type: "form-data",
      fields: [
        { key: "file", value: "", enabled: true, kind: "file" },
        { key: "note", value: "string", enabled: true, kind: "text" },
      ],
    });
  });

  it("vendor json media type keeps an explicit content-type header", () => {
    const plan = importOpenApi({
      openapi: "3.0.0",
      info: {},
      paths: { "/v": { post: { requestBody: { content: { "application/vnd.api+json": { example: { a: 1 } } } } } } },
    });
    expect((plan.items[0] as HttpRequestDoc).headers).toEqual([{ key: "Content-Type", value: "application/vnd.api+json", enabled: true }]);
  });

  it("warns when the server url is relative", () => {
    const plan = importOpenApi({ openapi: "3.0.0", info: {}, servers: [{ url: "/api/v3" }], paths: {} });
    expect(plan.collection.variables[0]).toMatchObject({ key: "baseUrl", value: "/api/v3" });
    expect(plan.warnings.join("\n")).toMatch(/relative/);
  });

  it("keeps credential variables secret even when a path parameter shares the name, and roots paths", () => {
    const plan = importOpenApi({
      openapi: "3.0.0",
      info: {},
      servers: [{ url: "https://good.test" }],
      components: { securitySchemes: { b: { type: "http", scheme: "bearer" } } },
      paths: { "@evil.test/{token}": { get: { security: [{ b: [] }] } } },
    });
    expect(plan.collection.variables.find((v) => v.key === "token")?.secret).toBe(true);
    expect((plan.items[0] as HttpRequestDoc).url).toBe("{{baseUrl}}/@evil.test/{{token}}");
  });
});
