import { expect as chaiExpect } from "chai";
import CryptoJS from "crypto-js";
import lodash from "lodash";

/** Small, always-loaded modules. */
const EAGER: Record<string, unknown> = {
  "crypto-js": CryptoJS,
  lodash,
  chai: { expect: chaiExpect },
  atob: (s: string) => atob(s),
  btoa: (s: string) => btoa(s),
};

// CJS 패키지는 default 로, ESM(uuid)은 네임스페이스 그대로 넘어온다.
const unwrap = (m: { default?: unknown }) => m.default ?? m;

/** Heavier modules, split into their own chunks and loaded only when a script requires them. */
const LAZY: Record<string, () => Promise<unknown>> = {
  jsrsasign: () => import("jsrsasign").then(unwrap),
  moment: () => import("moment").then(unwrap),
  uuid: () => import("uuid"),
  buffer: () => import("buffer").then(unwrap),
  url: () => import("url").then(unwrap),
  xml2js: () => import("xml2js").then(unwrap),
};

export const MODULE_NAMES = [...Object.keys(EAGER), ...Object.keys(LAZY)];

/** Globals Postman exposes without require. */
export const MODULE_GLOBALS = { CryptoJS, _: lodash };

// 정적인 require('name') 만 찾는다. require(변수) 는 미리 불러올 수 없어 EAGER 모듈만 된다.
const REQUIRE_RE = /\brequire\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g;

/** Loads every module the code requires with a literal name, so the synchronous `require` can return it. */
export async function loadModules(code: string): Promise<Record<string, unknown>> {
  const modules: Record<string, unknown> = { ...EAGER };
  const names = new Set([...code.matchAll(REQUIRE_RE)].map((m) => m[2]).filter((n) => Object.hasOwn(LAZY, n)));
  await Promise.all([...names].map(async (n) => (modules[n] = await LAZY[n]())));
  return modules;
}
