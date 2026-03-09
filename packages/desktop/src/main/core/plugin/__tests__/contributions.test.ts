import { describe, it, expect } from "vitest";

import { buildContributions, EMPTY_CONTRIBUTIONS } from "../contributions";

describe("buildContributions", () => {
  it("returns empty map when no routers", () => {
    const result = buildContributions([{ name: "a" }, { name: "b" }]);
    expect(result.routers.size).toBe(0);
  });

  it("maps router to plugin name", () => {
    const fakeRouter = { getInfo: {} } as any;
    const result = buildContributions([{ name: "myPlugin", router: fakeRouter }]);
    expect(result.routers.get("myPlugin")).toBe(fakeRouter);
  });

  it("skips items with no router", () => {
    const fakeRouter = {} as any;
    const result = buildContributions([{ name: "a" }, { name: "b", router: fakeRouter }]);
    expect(result.routers.size).toBe(1);
    expect(result.routers.get("b")).toBe(fakeRouter);
  });

  it("handles multiple items with routers", () => {
    const r1 = {} as any;
    const r2 = {} as any;
    const result = buildContributions([
      { name: "p1", router: r1 },
      { name: "p2", router: r2 },
    ]);
    expect(result.routers.get("p1")).toBe(r1);
    expect(result.routers.get("p2")).toBe(r2);
  });
});

describe("EMPTY_CONTRIBUTIONS", () => {
  it("has empty routers map", () => {
    expect(EMPTY_CONTRIBUTIONS.routers.size).toBe(0);
  });
});
