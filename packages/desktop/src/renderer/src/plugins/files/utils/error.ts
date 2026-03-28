import type { TFunction } from "react-i18next";

import type { FileErrorCode } from "../../../../shared/plugins/files/contract";

export function getCreateErrorMessage(
  errorCode: FileErrorCode | undefined,
  defaultMessage: string,
  type: "file" | "folder",
  t: TFunction,
) {
  if (errorCode === "already_exists") {
    return t(`error.${type}AlreadyExists`);
  }
  if (errorCode === "path_required") {
    return t("error.pathRequired");
  }
  const key = type === "file" ? "createFileFailed" : "createFolderFailed";
  return t(`error.${key}`, { error: defaultMessage });
}
