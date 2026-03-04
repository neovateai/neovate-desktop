import { z } from "zod";

export const preferencesSchema = z.object({
  theme: z.enum(["system", "light", "dark"]),
  fontSize: z.number(),
});

export const settingsSchema = z.object({
  preferences: preferencesSchema,
});

export type SettingsSchema = z.infer<typeof settingsSchema>;
export type Preferences = SettingsSchema["preferences"];

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  fontSize: 14,
};
