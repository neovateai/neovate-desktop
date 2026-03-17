/**
 * Localized string: plain string or locale→string map.
 *
 * - `string` — returned as-is (unlocalized fallback)
 * - `Record<string, string>` — keyed by locale (e.g. `{ "en-US": "Editor", "zh-CN": "编辑器" }`)
 */
export type LocalizedString = string | Record<string, string>;

/**
 * Resolve a `LocalizedString` to a display string for the given locale.
 * Falls back to `"en-US"`, then to the first available value.
 */
export function resolveLocalizedString(value: LocalizedString, locale: string): string {
  if (typeof value === "string") return value;
  return value[locale] ?? value["en-US"] ?? Object.values(value)[0] ?? "";
}
