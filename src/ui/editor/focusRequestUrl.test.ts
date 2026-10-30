import { afterEach, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { focusRequestUrl } from "./focusRequestUrl";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("focuses the URL editor and selects its entire document", () => {
  const content = {};
  const view = { focus: vi.fn(), dispatch: vi.fn(), state: { doc: { length: 42 } } };
  const find = vi.spyOn(EditorView, "findFromDOM").mockReturnValue(view as unknown as EditorView);
  const query = vi.fn().mockReturnValue(content);
  vi.stubGlobal("document", { querySelector: query });
  focusRequestUrl();
  expect(query).toHaveBeenCalledWith("[data-request-url] .cm-content");
  expect(find).toHaveBeenCalledWith(content);
  expect(view.focus).toHaveBeenCalledOnce();
  expect(view.dispatch).toHaveBeenCalledWith({ selection: { anchor: 0, head: 42 }, scrollIntoView: true });
});

it("does nothing when the active tab has no URL editor", () => {
  vi.stubGlobal("document", { querySelector: () => null });
  expect(() => focusRequestUrl()).not.toThrow();
});
