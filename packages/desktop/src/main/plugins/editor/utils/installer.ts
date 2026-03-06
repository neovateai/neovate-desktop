import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { ensureExtension } from "./extension-path";
import { EXTENSIONS_DIR } from "./constants";

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
  console.log("[extractVsix] 解压 VSIX:", path.basename(vsixPath));

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
    console.error("[extractVsix] 解压失败:", error);
    throw new Error(`解压失败: ${error instanceof Error ? error.message : String(error)}`);
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
    console.error("[readExtensionManifest] 扩展清单文件不存在，目录内容:");
    const files = fs.readdirSync(tempDir, { withFileTypes: true });
    files.forEach((file) => {
      console.error(`  ${file.isDirectory() ? "📁" : "📄"} ${file.name}`);
    });
    throw new Error(`扩展清单文件不存在。在以下位置查找失败: ${manifestPath}`);
  }

  console.log("[readExtensionManifest] 找到清单文件:", manifestPath);

  try {
    const manifestContent = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestContent);

    // 验证必要的字段，但允许 publisher 为空（使用 undefined_publisher）
    if (!manifest.name || !manifest.version) {
      console.error("[readExtensionManifest] 清单缺少必要字段:", {
        publisher: manifest.publisher,
        name: manifest.name,
        version: manifest.version,
      });
      throw new Error("扩展清单缺少必要字段 (name, version)");
    }

    // 如果 publisher 不存在，使用默认值
    if (!manifest.publisher) {
      console.warn(
        "[readExtensionManifest] 扩展清单缺少 publisher 字段，使用默认值: undefined_publisher",
      );
      manifest.publisher = "undefined_publisher";
    }

    console.log("[readExtensionManifest] 成功读取清单:", {
      publisher: manifest.publisher,
      name: manifest.name,
      version: manifest.version,
    });

    return manifest;
  } catch (error) {
    console.error("[readExtensionManifest] 读取或解析清单文件失败:", error);
    throw new Error(`读取扩展清单失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function installExtension(): Promise<void> {
  const vsixPath = await ensureExtension();
  console.log("[installExtension] 开始安装扩展，VSIX 路径:", vsixPath);

  if (!fs.existsSync(vsixPath)) {
    console.error("[installExtension] VSIX 文件不存在:", vsixPath);
    throw new Error(`VSIX file not found: ${vsixPath}`);
  }

  const extensionPath = EXTENSIONS_DIR;
  const extensionJSON = path.join(extensionPath, "extensions.json");
  console.log("[installExtension] 扩展目录:", extensionPath);
  console.log("[installExtension] 扩展注册文件:", extensionJSON);

  if (!fs.existsSync(extensionPath)) {
    console.log("[installExtension] 创建扩展目录");
    fs.mkdirSync(extensionPath, { recursive: true });
  }

  let extensions: ExtensionRegistration[] = [];

  if (fs.existsSync(extensionJSON)) {
    try {
      console.log("[installExtension] 读取现有扩展注册文件");
      const content = fs.readFileSync(extensionJSON, "utf-8");
      const parsed = JSON.parse(content || "[]");
      extensions = Array.isArray(parsed) ? parsed : [];
      console.log("[installExtension] 现有扩展数量:", extensions.length);
    } catch (error) {
      console.error("[installExtension] 读取或解析 extensions.json 失败:", error);
      extensions = [];
    }
  } else {
    console.log("[installExtension] 扩展注册文件不存在，将创建新文件");
  }

  const tempDir = path.join(
    extensionPath,
    ".temp",
    `ext-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
  );
  console.log("[installExtension] 创建临时目录:", tempDir);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    console.log("[installExtension] 开始解压 VSIX 文件");
    await extractVsix(vsixPath, tempDir);
    console.log("[installExtension] VSIX 解压完成");

    console.log("[installExtension] 读取扩展清单");
    const manifest = readExtensionManifest(tempDir);
    console.log("[installExtension] 扩展信息:", {
      publisher: manifest.publisher,
      name: manifest.name,
      version: manifest.version,
    });

    const extensionId = generateExtensionId(manifest.publisher, manifest.name);
    const extensionDirName = `${extensionId}-${manifest.version}`;
    const extensionDir = path.join(extensionPath, extensionDirName);
    console.log("[installExtension] 扩展ID:", extensionId);
    console.log("[installExtension] 扩展目录名:", extensionDirName);
    console.log("[installExtension] 目标目录:", extensionDir);

    if (fs.existsSync(extensionDir)) {
      console.log("[installExtension] 检测到已安装的扩展，删除旧版本");
      fs.rmSync(extensionDir, { recursive: true, force: true });
    }

    console.log("[installExtension] 移动临时目录到最终位置");
    fs.renameSync(tempDir, extensionDir);
    console.log("[installExtension] 目录移动完成");

    const relativeLocation = extensionDirName;
    console.log("[installExtension] 相对位置:", relativeLocation);

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

    console.log("[installExtension] 更新扩展注册列表");
    extensions = extensions.filter((ext) => ext.identifier.id !== extensionId);
    extensions.push(extensionRegistration);

    console.log("[installExtension] 写入扩展注册文件");
    fs.writeFileSync(extensionJSON, JSON.stringify(extensions, null, 2));
    console.log("[installExtension] 扩展安装成功!");
  } catch (error) {
    console.error("[installExtension] 安装扩展失败:", error);
    if (fs.existsSync(tempDir)) {
      console.log("[installExtension] 清理临时目录:", tempDir);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
}
