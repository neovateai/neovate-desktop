import { describe, it, expect } from "vitest";

import { trackInputSchema } from "../../../../shared/features/analytics/contract";

describe("analytics track input validation", () => {
  it("accepts valid event with no properties", () => {
    expect(trackInputSchema.safeParse({ event: "ui.settings.navigated" }).success).toBe(true);
  });

  it("accepts valid event with properties", () => {
    expect(
      trackInputSchema.safeParse({
        event: "ui.page.viewed",
        properties: { page: "settings", trackType: "programmatic" },
      }).success,
    ).toBe(true);
  });

  it("rejects invalid event names", () => {
    expect(trackInputSchema.safeParse({ event: "modelChanged" }).success).toBe(false);
    expect(trackInputSchema.safeParse({ event: "agent.session" }).success).toBe(false);
  });

  it("accepts event names with 3+ segments", () => {
    expect(trackInputSchema.safeParse({ event: "ui.model.change.confirmed" }).success).toBe(true);
  });
});
