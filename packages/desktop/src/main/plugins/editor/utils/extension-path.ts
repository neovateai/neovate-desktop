import path from "path";
import https from "https";
import fs from "fs";
import { EXTENSIONS_DIR } from "./constants";

const RESOURCE_PATH =
  "https://mdn.alipayobjects.com/portal_metor2/afts/file/A*XtoJQpzujs0AAAAAQGAAAAgAegAAAQ"; // 0.0.7
const VSIX_FILENAME = "neovate-code-extension-0.0.7.vsix";

export function ensureExtension(): Promise<string> {
  return new Promise((resolve, reject) => {
    // 确保extensions目录存在
    if (!fs.existsSync(EXTENSIONS_DIR)) {
      fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });
    }

    const extensionPath = path.join(EXTENSIONS_DIR, VSIX_FILENAME);

    // 如果文件已经存在，直接返回路径
    if (fs.existsSync(extensionPath)) {
      resolve(extensionPath);
      return;
    }

    const file = fs.createWriteStream(extensionPath);

    https
      .get(RESOURCE_PATH, (response) => {
        if (response.statusCode === 200) {
          response.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve(extensionPath);
          });

          file.on("error", (err) => {
            fs.unlinkSync(extensionPath);
            reject(err);
          });
        } else {
          reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
        }
      })
      .on("error", (err) => {
        if (fs.existsSync(extensionPath)) {
          fs.unlinkSync(extensionPath);
        }
        reject(err);
      });
  });
}
