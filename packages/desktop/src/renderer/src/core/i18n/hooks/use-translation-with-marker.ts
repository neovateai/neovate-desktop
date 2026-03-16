import { useTranslation } from "react-i18next";

const NLS_MARKER_RE = /^%([^%]+)%$/;

/**
 * React hook that resolves `%namespace:key%` NLS markers to translated strings.
 * Non-marker strings are returned as-is.
 * Reactive: re-renders on language change.
 */
export function useTranslationWithMarker() {
  const { t } = useTranslation();
  return (value: string) => {
    const match = NLS_MARKER_RE.exec(value);
    return match ? t(match[1] as never) : value;
  };
}
