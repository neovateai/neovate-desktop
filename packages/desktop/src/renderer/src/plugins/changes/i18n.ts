import { useTranslation } from "react-i18next";

export const useChangesTranslation = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { t, ...rest } = useTranslation("plugin-changes" as any);
  return { t: t as (key: string, options?: Record<string, unknown>) => string, ...rest };
};
