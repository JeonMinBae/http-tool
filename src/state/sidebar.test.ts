import { beforeEach, describe, expect, it } from "vitest";
import { useSidebar } from "./sidebar";

describe("sidebar store", () => {
  beforeEach(() => useSidebar.setState({ section: "history", focusPending: false, mode: "requests", query: "" }));

  it("focusSearch switches to collections and leaves a pending focus until consumed", () => {
    useSidebar.getState().focusSearch();
    expect(useSidebar.getState()).toMatchObject({ section: "collections", focusPending: true });
    useSidebar.getState().consumeFocus();
    expect(useSidebar.getState().focusPending).toBe(false);
  });

  it("keeps the search mode and query when focusing again", () => {
    useSidebar.setState({ mode: "variables", query: "tok" });
    useSidebar.getState().focusSearch();
    expect(useSidebar.getState()).toMatchObject({ mode: "variables", query: "tok" });
  });
});
