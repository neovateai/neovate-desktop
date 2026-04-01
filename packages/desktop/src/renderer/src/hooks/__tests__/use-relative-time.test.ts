import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { formatRelativeTime } from "../use-relative-time";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatRelativeTime", () => {
  it("formats seconds", () => {
    const now = new Date();
    now.setSeconds(now.getSeconds() - 30);
    expect(formatRelativeTime(now.toISOString())).toBe("30s");
  });

  it("formats minutes", () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5);
    expect(formatRelativeTime(now.toISOString())).toBe("5m");
  });

  it("formats hours", () => {
    const now = new Date();
    now.setHours(now.getHours() - 2);
    expect(formatRelativeTime(now.toISOString())).toBe("2h");
  });

  it("formats days", () => {
    const now = new Date();
    now.setDate(now.getDate() - 3);
    expect(formatRelativeTime(now.toISOString())).toBe("3d");
  });

  it("formats months", () => {
    const now = new Date();
    now.setMonth(now.getMonth() - 2);
    expect(formatRelativeTime(now.toISOString())).toBe("2mo");
  });

  it("updates when time advances", () => {
    const iso = new Date().toISOString();
    expect(formatRelativeTime(iso)).toBe("0s");

    vi.advanceTimersByTime(10_000);
    expect(formatRelativeTime(iso)).toBe("10s");

    vi.advanceTimersByTime(50_000);
    expect(formatRelativeTime(iso)).toBe("1m");

    vi.advanceTimersByTime(60_000);
    expect(formatRelativeTime(iso)).toBe("2m");
  });
});
