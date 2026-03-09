import { describe, expectTypeOf, it } from "vitest";

import type { Preferences } from "../../../../../shared/features/settings/schema";
import type { ISettingsService, IScopedSettings } from "../../../core/types";

declare const service: ISettingsService;

describe("Settings type safety", () => {
  it("scoped('preferences') returns IScopedSettings<Preferences>", () => {
    const scoped = service.scoped("preferences");
    expectTypeOf(scoped).toEqualTypeOf<IScopedSettings<Preferences>>();
  });

  it("scoped() rejects invalid namespace", () => {
    // @ts-expect-error - "invalid" is not a valid namespace
    service.scoped("invalid");
  });

  it("get() returns the correct type for known keys", () => {
    const scoped = service.scoped("preferences");
    expectTypeOf(scoped.get("theme")).toEqualTypeOf<"system" | "light" | "dark" | undefined>();
    expectTypeOf(scoped.get("fontSize")).toEqualTypeOf<number | undefined>();
  });

  it("get() rejects unknown keys", () => {
    const scoped = service.scoped("preferences");
    // @ts-expect-error - "unknown" is not a valid key
    scoped.get("unknown");
  });

  it("set() enforces correct value type", () => {
    const scoped = service.scoped("preferences");
    scoped.set("theme", "dark");
    // @ts-expect-error - number is not assignable to theme
    scoped.set("theme", 123);
  });

  it("set() rejects unknown keys", () => {
    const scoped = service.scoped("preferences");
    // @ts-expect-error - "unknown" is not a valid key
    scoped.set("unknown", "value");
  });

  it("getAll() returns Partial<Preferences>", () => {
    const scoped = service.scoped("preferences");
    expectTypeOf(scoped.getAll()).toEqualTypeOf<Partial<Preferences>>();
  });
});
