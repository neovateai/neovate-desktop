import os from "node:os";
import path from "node:path";

// Version pinning (matches Ami's artifacts)
export const CODE_SERVER_VERSION = "e104b68";
// Storage paths
export const CODE_SERVER_DIR = path.join(os.homedir(), ".neovate", "code-server");

// Platform mapping for download URL
function getPlatformString() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin") {
    return arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  }
  // TODO: support these platform later.
  // if (platform === 'linux') {
  //   if (arch === 'arm64') return 'linux-arm64';
  //   if (arch === 'arm') return 'linux-armv7l';
  //   return 'linux-amd64';
  // }
  // if (platform === 'win32') {
  //   return arch === 'arm64' ? 'win32-arm64' : 'win32-x64';
  // }

  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

const ASSET_RESOURCE_URL: Record<string, string> = {
  // https://github.com/coder/code-server/releases/download/v4.108.1/code-server-4.108.1-macos-arm64.tar.gz
  "darwin-arm64":
    "https://mdn.alipayobjects.com/portal_metor2/afts/file/A*2noESpILUHEAAAAAh-AAAAgAegAAAQ",
  // https://github.com/coder/code-server/releases/download/v4.108.2/code-server-4.108.2-macos-amd64.tar.gz
  "darwin-x64":
    "https://mdn.alipayobjects.com/portal_metor2/afts/file/A*PCbjQ4l9vFIAAAAAh-AAAAgAegAAAQ",
};

// Download URL
export const getArtifactUrl = (): string => {
  const platformString = getPlatformString();
  const url = ASSET_RESOURCE_URL[platformString];
  if (!url) {
    throw new Error("Editor Server assets not found");
  }
  return url;
};

// Extracted binary path
export const getCodeServerBinaryPath = (): string => {
  return path.join(CODE_SERVER_DIR, CODE_SERVER_VERSION);
};

// Entry point for code-server
export const getCodeServerEntryPath = (): string => {
  return path.join(getCodeServerBinaryPath(), "out", "node", "import.js");
};
