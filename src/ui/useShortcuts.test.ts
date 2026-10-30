import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), dialog: vi.fn(), focusUrl: vi.fn(), reopen: vi.fn(), help: vi.fn(), cleanup: undefined as (() => void) | undefined }));
vi.mock("react", () => ({ useEffect: (fn: () => () => void) => { mocks.cleanup = fn(); } }));
vi.mock("./actions", () => ({ refreshCollections: mocks.refresh, closeTab: vi.fn(), newUntitledRequest: vi.fn(), saveActiveTab: vi.fn() }));
vi.mock("../core/execute", () => ({ executeRequest: vi.fn() }));
vi.mock("../state/responses", () => ({ useResponses: {} }));
vi.mock("../state/sidebar", () => ({ useSidebar: {} }));
vi.mock("../state/tabs", () => ({ useTabs: { getState: () => ({ reopenClosed: mocks.reopen }) } }));
vi.mock("./editor/focusRequestUrl", () => ({ focusRequestUrl: mocks.focusUrl }));
vi.mock("./common/ShortcutsDialog", () => ({ openShortcutsHelp: mocks.help }));
vi.mock("./common/dialogs", () => ({ isDialogOpen: mocks.dialog }));
vi.mock("./response/ResponseViewer", () => ({ cycleBodyMode: vi.fn() }));
vi.mock("./settings/SettingsDialog", () => ({ openSettings: vi.fn() }));

let listeners: Map<boolean, (event: KeyboardEvent) => void>;
async function setup(platform = "Win32") {
  vi.stubGlobal("navigator", { platform });
  const { useShortcuts } = await import("./useShortcuts");
  useShortcuts();
}
function press(key: string, modifiers: Partial<KeyboardEvent> = {}) {
  const event = {
    key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, repeat: false, isComposing: false,
    preventDefault: vi.fn(), stopPropagation: vi.fn(), ...modifiers,
  };
  listeners.get(true)!(event as unknown as KeyboardEvent);
  return event;
}

beforeEach(() => {
  vi.resetModules();
  mocks.refresh.mockReset().mockResolvedValue(undefined);
  mocks.dialog.mockReset().mockReturnValue(false);
  mocks.focusUrl.mockReset();
  mocks.reopen.mockReset();
  mocks.help.mockReset();
  listeners = new Map();
  vi.stubGlobal("window", {
    addEventListener: (_: string, listener: (event: KeyboardEvent) => void, capture = false) => listeners.set(capture, listener),
    removeEventListener: (_: string, listener: (event: KeyboardEvent) => void, capture = false) => {
      if (listeners.get(capture) === listener) listeners.delete(capture);
    },
  });
});
afterEach(() => { mocks.cleanup?.(); vi.unstubAllGlobals(); });

describe("collection refresh shortcuts", () => {
  it.each([
    ["F5", {}], ["F5", { ctrlKey: true }], ["F5", { shiftKey: true }],
    ["r", { ctrlKey: true }], ["R", { ctrlKey: true, shiftKey: true }],
  ])("reserves %s %j before editors and refreshes collections", async (key, modifiers) => {
    await setup();
    const event = press(key, modifiers);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("uses Command+R on macOS", async () => {
    await setup("MacIntel");
    expect(press("r", { ctrlKey: true }).preventDefault).not.toHaveBeenCalled();
    expect(press("r", { metaKey: true }).preventDefault).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("blocks webview reload in a dialog without refreshing collections", async () => {
    await setup();
    mocks.dialog.mockReturnValue(true);
    expect(press("F5").preventDefault).toHaveBeenCalledOnce();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("ignores plain typing, Alt combinations, key repeat and IME composition", async () => {
    await setup();
    expect(press("r").preventDefault).not.toHaveBeenCalled();
    expect(press("r", { ctrlKey: true, altKey: true }).preventDefault).not.toHaveBeenCalled();
    press("F5", { repeat: true });
    press("F5", { isComposing: true });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("coalesces overlapping refreshes and allows another after completion", async () => {
    await setup();
    let finish!: () => void;
    mocks.refresh.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    press("F5");
    press("r", { ctrlKey: true });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    finish();
    await Promise.resolve();
    press("F5");
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    mocks.cleanup?.();
    expect(listeners.size).toBe(0);
  });
});

describe("navigation shortcuts", () => {
  it.each(["Win32", "MacIntel"])("focuses URL, restores tabs and opens help on %s", async (platform) => {
    await setup(platform);
    const mod = platform === "MacIntel" ? { metaKey: true } : { ctrlKey: true };
    for (const [key, extra] of [["l", {}], ["T", { shiftKey: true }], ["/", {}]] as const) {
      const event = press(key, { ...mod, ...extra });
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(event.stopPropagation).toHaveBeenCalledOnce();
    }
    expect(mocks.focusUrl).toHaveBeenCalledOnce();
    expect(mocks.reopen).toHaveBeenCalledOnce();
    expect(mocks.help).toHaveBeenCalledWith(platform === "MacIntel");
  });

  it("blocks browser actions but leaves dialogs and IME composition undisturbed", async () => {
    await setup();
    mocks.dialog.mockReturnValue(true);
    expect(press("l", { ctrlKey: true }).preventDefault).toHaveBeenCalledOnce();
    press("T", { ctrlKey: true, shiftKey: true });
    press("/", { ctrlKey: true });
    mocks.dialog.mockReturnValue(false);
    press("l", { ctrlKey: true, isComposing: true });
    press("T", { ctrlKey: true, shiftKey: true, repeat: true });
    expect(mocks.focusUrl).not.toHaveBeenCalled();
    expect(mocks.reopen).not.toHaveBeenCalled();
    expect(mocks.help).not.toHaveBeenCalled();
    expect(press("/", { ctrlKey: true, altKey: true }).preventDefault).not.toHaveBeenCalled();
  });
});
