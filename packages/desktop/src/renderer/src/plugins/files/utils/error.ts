import type { FileErrorCode } from "../../../../../shared/plugins/files/contract";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getCreateErrorMessage(
  errorCode: FileErrorCode | undefined,
  defaultMessage: string,
  type: "file" | "folder",
  t: (...args: any[]) => string,
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
