import { z } from "zod";

export const preferencesSchema = z.object({
  theme: z.enum(["system", "light", "dark"]),
  fontSize: z.number(),
  count: z.number(),
});

export const settingsSchema = z.object({
  preferences: preferencesSchema,
});

export type SettingsSchema = z.infer<typeof settingsSchema>;
export type Preferences = SettingsSchema["preferences"];

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  fontSize: 14,
  count: 0,
};

export const DEFAULT_SETTINGS: SettingsSchema = {
  preferences: DEFAULT_PREFERENCES,
};
