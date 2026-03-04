export type Preferences = {
  theme: "system" | "light" | "dark";
  fontSize: number;
};

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  fontSize: 14,
};
