import { describe, it, expect } from "vitest";

import { trackInputSchema } from "../../../../shared/features/analytics/contract";

describe("analytics track input validation", () => {
  it("accepts valid event names in domain.entity.action format", () => {
    expect(trackInputSchema.safeParse({ event: "agent.session.created" }).success).toBe(true);
    expect(trackInputSchema.safeParse({ event: "ui.page.viewed" }).success).toBe(true);
    expect(trackInputSchema.safeParse({ event: "ui.model.change.confirmed" }).success).toBe(true);
  });

  it("rejects invalid event names", () => {
    expect(trackInputSchema.safeParse({ event: "modelChanged" }).success).toBe(false);
    expect(trackInputSchema.safeParse({ event: "page_view" }).success).toBe(false);
    expect(trackInputSchema.safeParse({ event: "click" }).success).toBe(false);
    expect(trackInputSchema.safeParse({ event: "agent.session" }).success).toBe(false);
  });

  it("defaults properties to empty object", () => {
    const result = trackInputSchema.safeParse({ event: "ui.page.viewed" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.properties).toEqual({});
    }
  });

  it("passes through properties", () => {
    const result = trackInputSchema.safeParse({
      event: "ui.page.viewed",
      properties: { page: "settings", count: 42 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.properties).toEqual({ page: "settings", count: 42 });
    }
  });
});
