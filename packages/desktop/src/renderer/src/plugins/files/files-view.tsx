import { useFilesTranslation } from "./i18n";

export default function FilesView() {
  const { t } = useFilesTranslation();

  return (
    <div className="flex h-full flex-col p-3">
      <h2 className="text-xs font-semibold text-muted-foreground">{t("files.title")}</h2>
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs text-muted-foreground">Coming soon</p>
      </div>
    </div>
  );
}
