import AdmZip from "adm-zip";
import debug from "debug";
import fs from "node:fs";
import path from "node:path";

import { EXTENSIONS_DIR } from "./constants";

const log = debug("neovate:editor:installer");
import { ensureExtension } from "./extension-path";

interface ExtensionManifest {
  publisher: string;
  name: string;
  version: string;
  [key: string]: any;
}

interface ExtensionIdentifier {
  id: string;
}

interface ExtensionLocation {
  $mid: number;
  fsPath: string;
  external: string;
  path: string;
  scheme: string;
}

interface ExtensionRegistration {
  identifier: ExtensionIdentifier;
  version: string;
  location: ExtensionLocation;
  relativeLocation: string;
  metadata: {
    installedTimestamp: number;
    pinned: boolean;
    source: string;
  };
}

async function extractVsix(vsixPath: string, targetDir: string): Promise<void> {
  try {
    const zip = new AdmZip(vsixPath);

    // 检查 ZIP 文件结构
    const hasExtensionDir = zip
      .getEntries()
      .some(
        (entry) => entry.entryName === "extension/" || entry.entryName.startsWith("extension/"),
      );

    if (hasExtensionDir) {
      const tempExtractDir = path.join(targetDir, "_temp_extract");
      fs.mkdirSync(tempExtractDir, { recursive: true });

      zip.extractAllTo(tempExtractDir, true);

      const extensionDir = path.join(tempExtractDir, "extension");
      if (fs.existsSync(extensionDir)) {
        const files = fs.readdirSync(extensionDir);
        for (const file of files) {
          fs.renameSync(path.join(extensionDir, file), path.join(targetDir, file));
        }
      }

      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    } else {
      zip.extractAllTo(targetDir, true);
    }
  } catch (error) {
    console.error("[extractVsix] extraction failed:", error);
    throw new Error(`Extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function generateExtensionId(publisher: string, name: string): string {
  return `${publisher}.${name}`;
}

function readExtensionManifest(tempDir: string): ExtensionManifest {
  // 首先尝试在 extension/package.json 路径查找
  let manifestPath = path.join(tempDir, "extension", "package.json");

  if (!fs.existsSync(manifestPath)) {
    // 如果不存在，尝试在根目录查找 package.json
    manifestPath = path.join(tempDir, "package.json");
  }

  if (!fs.existsSync(manifestPath)) {
    // 如果还是不存在，尝试查找任何 package.json 文件
    const files = fs.readdirSync(tempDir, { withFileTypes: true });
    for (const file of files) {
      if (file.isDirectory()) {
        const potentialPath = path.join(tempDir, file.name, "package.json");
        if (fs.existsSync(potentialPath)) {
          manifestPath = potentialPath;
          break;
        }
      }
    }
  }

  if (!fs.existsSync(manifestPath)) {
    const entries = fs.readdirSync(tempDir, { withFileTypes: true }).map((f) => f.name);
    log("extension manifest not found at %s, dir contents: %o", manifestPath, entries);
    throw new Error(`Extension manifest not found. Lookup failed at: ${manifestPath}`);
  }

  try {
    const manifestContent = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestContent);

    // 验证必要的字段，但允许 publisher 为空（使用 undefined_publisher）
    if (!manifest.name || !manifest.version) {
      log("manifest missing required fields", {
        publisher: manifest.publisher,
        name: manifest.name,
        version: manifest.version,
      });
      throw new Error("Extension manifest missing required fields (name, version)");
    }

    // 如果 publisher 不存在，使用默认值
    if (!manifest.publisher) {
      log("manifest missing publisher field, using default: undefined_publisher");
      manifest.publisher = "undefined_publisher";
    }

    return manifest;
  } catch (error) {
    console.error("[readExtensionManifest] failed to read or parse manifest:", error);
    throw new Error(
      `Failed to read extension manifest: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function installExtension(): Promise<void> {
  log("installing extension");
  const vsixPath = await ensureExtension();

  if (!fs.existsSync(vsixPath)) {
    throw new Error(`VSIX file not found: ${vsixPath}`);
  }

  const extensionPath = EXTENSIONS_DIR;
  const extensionJSON = path.join(extensionPath, "extensions.json");

  if (!fs.existsSync(extensionPath)) {
    fs.mkdirSync(extensionPath, { recursive: true });
  }

  let extensions: ExtensionRegistration[] = [];

  if (fs.existsSync(extensionJSON)) {
    try {
      const content = fs.readFileSync(extensionJSON, "utf-8");
      const parsed = JSON.parse(content || "[]");
      extensions = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("[installExtension] failed to parse extensions.json:", error);
      extensions = [];
    }
  }

  const tempDir = path.join(
    extensionPath,
    ".temp",
    `ext-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
  );
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    await extractVsix(vsixPath, tempDir);
    const manifest = readExtensionManifest(tempDir);

    const extensionId = generateExtensionId(manifest.publisher, manifest.name);
    const extensionDirName = `${extensionId}-${manifest.version}`;
    const extensionDir = path.join(extensionPath, extensionDirName);

    if (fs.existsSync(extensionDir)) {
      fs.rmSync(extensionDir, { recursive: true, force: true });
    }

    fs.renameSync(tempDir, extensionDir);

    const relativeLocation = extensionDirName;

    const extensionRegistration: ExtensionRegistration = {
      identifier: {
        id: extensionId,
      },
      version: manifest.version,
      location: {
        $mid: 1,
        fsPath: extensionDir,
        external: `file://${extensionDir}`,
        path: extensionDir,
        scheme: "file",
      },
      relativeLocation,
      metadata: {
        installedTimestamp: Date.now(),
        pinned: false,
        source: "vsix",
      },
    };

    extensions = extensions.filter((ext) => ext.identifier.id !== extensionId);
    extensions.push(extensionRegistration);

    fs.writeFileSync(extensionJSON, JSON.stringify(extensions, null, 2));
    log("installed %s@%s", extensionId, manifest.version);
  } catch (error) {
    console.error("[installExtension] failed:", error);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
}
