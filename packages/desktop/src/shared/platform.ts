export const isWindows = process.platform === "win32";
export const isMac = process.platform === "darwin";
export const isLinux = process.platform === "linux";

/** File extension for executables: `".exe"` on Windows, `""` elsewhere. */
export const EXE_EXT = isWindows ? ".exe" : "";
