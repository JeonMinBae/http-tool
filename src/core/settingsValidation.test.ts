import { expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./model";
import { validateSettings } from "./settingsValidation";

const manual = (url: string) => ({ ...DEFAULT_SETTINGS, proxy: { mode: "manual" as const, url, bypass: "" } });

it("accepts defaults and supported proxy schemes", () => {
  expect(validateSettings(DEFAULT_SETTINGS)).toBeNull();
  for (const u of ["http://p:8080", "https://p", "socks5://p:1080", "socks5h://user:pw@p:1080"]) expect(validateSettings(manual(u))).toBeNull();
});

it("rejects unsupported proxy urls", () => {
  expect(validateSettings(manual("ftp://p"))).toMatch(/http/);
  expect(validateSettings(manual("p:8080"))).toMatch(/http|valid/);
  expect(validateSettings(manual(""))).toMatch(/valid/);
});

it("ignores proxy url unless manual", () => {
  expect(validateSettings({ ...DEFAULT_SETTINGS, proxy: { mode: "system", url: "garbage", bypass: "" } })).toBeNull();
});

it("validates numbers", () => {
  expect(validateSettings({ ...DEFAULT_SETTINGS, timeoutMs: -1 })).not.toBeNull();
  expect(validateSettings({ ...DEFAULT_SETTINGS, historyLimit: 0 })).not.toBeNull();
});
