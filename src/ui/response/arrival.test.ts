import { describe, expect, it } from "vitest";
import { forgetArrival, isNewArrival, markArrived } from "./arrival";

describe("arrival", () => {
  it("is new until marked, then only a different request is new", () => {
    expect(isNewArrival("t1", "r1")).toBe(true);
    markArrived("t1", "r1");
    expect(isNewArrival("t1", "r1")).toBe(false); // remount after tab switch
    expect(isNewArrival("t1", "r2")).toBe(true); // same response sent again gets a new requestId
  });

  it("tracks tabs separately", () => {
    markArrived("a", "r");
    expect(isNewArrival("b", "r")).toBe(true);
  });

  it("forgets a closed tab", () => {
    markArrived("c", "r");
    forgetArrival("c");
    expect(isNewArrival("c", "r")).toBe(true);
  });
});
