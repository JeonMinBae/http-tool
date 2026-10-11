import { describe, expect, it } from "vitest";
import { emptyRequest } from "../core/model";
import type { VarScopes } from "../core/variables";
import type { ScriptInput, ScriptResponse, ScriptSendRequest } from "./protocol";
import { runScriptCode } from "./runCode";

const s = (p: Partial<VarScopes> = {}): VarScopes => ({ local: {}, environment: {}, collection: {}, global: {}, ...p });
const response: ScriptResponse = { code: 201, status: "Created", headers: [["Content-Type", "application/json"]], body: '{"id":7,"tags":["a"]}', responseTime: 12, size: 21 };

function runInline(code: string, p: Partial<ScriptInput> = {}, send?: (r: ScriptSendRequest) => Promise<ScriptResponse>) {
  const req = emptyRequest("R");
  return runScriptCode(
    {
      phase: "post",
      code,
      scopes: s(),
      request: { name: req.name, method: "GET", url: "http://a/{{p}}", headers: [{ key: "A", value: "1", enabled: true }], body: { type: "none" } },
      response,
      hasEnvironment: true,
      ...p,
    },
    { sendRequest: send ?? (async () => response) },
  );
}

describe("pm variables", () => {
  it("pm.variables.get follows precedence, set writes local", async () => {
    const out = await runInline(
      `pm.variables.set('a','L'); pm.environment.set('e','E2');
       pm.test('p', () => pm.expect(pm.variables.get('a')).to.eql('L'));`,
      { scopes: s({ environment: { a: "E", e: "E" } }) },
    );
    expect(out.scopes.local.a).toBe("L");
    expect(out.scopes.environment).toEqual({ a: "E", e: "E2" });
    expect(out.tests).toEqual([{ name: "p", passed: true }]);
  });

  it("supports collection and global scopes, unset, has and replaceIn", async () => {
    const out = await runInline(
      `pm.collectionVariables.set('c', '1'); pm.globals.unset('g'); 
       console.log(pm.globals.has('g'), pm.variables.replaceIn('x-{{c}}'));`,
      { scopes: s({ global: { g: "x" } }) },
    );
    expect(out.scopes.collection).toEqual({ c: "1" });
    expect(out.scopes.global).toEqual({});
    expect(out.logs[0].args).toEqual(["false", "x-1"]);
  });

  it("drops environment writes without an active environment", async () => {
    const out = await runInline(`pm.environment.set('a','1')`, { hasEnvironment: false });
    expect(out.scopes.environment).toEqual({});
    expect(out.logs[0].level).toBe("warn");
  });
});

describe("pm.response and tests", () => {
  it("exposes response json, headers and status assertions", async () => {
    const out = await runInline(`
      pm.test('status', () => pm.response.to.have.status(201));
      pm.test('json', () => pm.expect(pm.response.json().id).to.equal(7));
      pm.test('header', () => pm.expect(pm.response.headers.get('content-type')).to.include('json'));
      pm.test('code', () => pm.expect(pm.response.code).to.be.below(300));
    `);
    expect(out.tests.every((t) => t.passed)).toBe(true);
    expect(out.tests).toHaveLength(4);
  });

  it("failing expect marks test failed without aborting script", async () => {
    const out = await runInline(`pm.test('f', () => pm.expect(1).to.eql(2)); console.log('after');`);
    expect(out.tests[0].passed).toBe(false);
    expect(out.tests[0].error).toMatch(/expected 1/);
    expect(out.logs[0].args).toEqual(["after"]);
  });

  it("waits for async tests", async () => {
    const out = await runInline(`pm.test('async', async () => { await new Promise(r => setTimeout(r, 5)); throw new Error('late'); });`);
    expect(out.tests).toEqual([{ name: "async", passed: false, error: "late" }]);
  });
});

describe("pm.request", () => {
  it("lets pre-request scripts modify headers, url and body", async () => {
    const out = await runInline(
      `pm.request.headers.add({ key: 'X', value: '2' });
       pm.request.headers.upsert({ key: 'a', value: '9' });
       pm.request.headers.remove('missing');
       pm.request.url = pm.request.url.toString() + '?q=1';
       pm.request.method = 'post';
       pm.request.body.update('{"x":1}');`,
      { phase: "pre", response: undefined },
    );
    expect(out.request.headers).toEqual([
      { key: "A", value: "9", enabled: true },
      { key: "X", value: "2", enabled: true },
    ]);
    expect(out.request.url).toBe("http://a/{{p}}?q=1");
    expect(out.request.method).toBe("POST");
    expect(out.request.body).toEqual({ type: "raw", language: "text", content: '{"x":1}' });
  });
});

describe("sandbox", () => {
  it("require only allows whitelisted modules", async () => {
    expect((await runInline(`require('fs')`)).error).toMatch(/not available/);
  });

  it("provides crypto-js and lodash", async () => {
    const out = await runInline(`
      const CryptoJS = require('crypto-js'); const _ = require('lodash');
      console.log(CryptoJS.HmacSHA256('msg', 'key').toString(CryptoJS.enc.Hex).slice(0, 8), _.get({a:{b:3}}, 'a.b'));
    `);
    expect(out.error).toBeUndefined();
    expect(out.logs[0].args).toEqual(["2d93cbc1", "3"]);
  });

  it("hides network globals", async () => {
    const out = await runInline(`console.log(typeof fetch, typeof XMLHttpRequest, typeof WebSocket, typeof globalThis)`);
    expect(out.logs[0].args).toEqual(["undefined undefined undefined undefined".split(" ")].flat());
  });

  it("reports thrown errors and keeps earlier results", async () => {
    const out = await runInline(`pm.test('ok', () => {}); pm.globals.set('g', '1'); throw new Error('boom');`);
    expect(out.error).toBe("boom");
    expect(out.tests).toHaveLength(1);
    expect(out.scopes.global.g).toBe("1");
  });

  it("pm.sendRequest calls back with the host response", async () => {
    const seen: ScriptSendRequest[] = [];
    const out = await runInline(
      `pm.sendRequest({ url: 'http://t/token', method: 'POST', header: { 'X-A': '1' }, body: { mode: 'raw', raw: 'x' } }, (err, res) => {
         pm.environment.set('token', res.json().id);
       });`,
      { scopes: s() },
      async (r) => {
        seen.push(r);
        return response;
      },
    );
    expect(seen).toEqual([{ method: "POST", url: "http://t/token", headers: [["X-A", "1"]], body: "x" }]);
    expect(out.scopes.environment.token).toBe("7");
  });
});
