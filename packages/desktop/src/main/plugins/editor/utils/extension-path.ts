import debug from "debug";
import fs from "fs";
import https from "https";
import path from "path";

const log = debug("neovate:editor:extension");

/**
 * neovate-code-extension: 配合 code-server 进行编辑器操作的插件，代码暂不在此仓库，和 code-server 一样通过 cdn 动态下发。
 * 插件大小约 6K。
 * CHANGELOG:
 * - 0.0.7 原仓库迁移，保留基础能力 ping/editor.open/editor.theme.set/editor.inspect
 * - 0.0.8 fix: 增加了socket 通信的粘包处理
 * - 0.0.9 feat: 消费 process.env.NEOVATE_BRIDGE_PORT 以匹配通信端口
 * - 0.1.0 feat: 增加 editor 文件 右键菜单 Add to Chat[context.add] 事件
 * - 0.1.1 feat: 增加 editor 激活tab变化事件通知，支持配置editor.open 时的focus 表现
 * - 0.1.2 feat: 打开文件时，支持图片文件进入预览
 * - 0.1.3 fix: tabs 变化时，如果为空数据未通知问题 & 优化了socket 通信对接逻辑
 */
const RESOURCE_PATH =
  "https://mdn.alipayobjects.com/portal_metor2/afts/file/A*yT79QZnHJ_gAAAAAQHAAAAgAegAAAQ"; // 0.1.3
const VSIX_FILENAME = "neovate-code-extension-0.1.3.vsix";

export function ensureExtension(extDir: string): Promise<string> {
  log("ensuring extension is available");
  return new Promise((resolve, reject) => {
    // 确保extensions目录存在
    if (!fs.existsSync(extDir)) {
      fs.mkdirSync(extDir, { recursive: true });
    }

    const extensionPath = path.join(extDir, VSIX_FILENAME);
    // const extensionPath = LOCAL_VSIX_PATH;

    if (fs.existsSync(extensionPath)) {
      log("extension already exists at %s", extensionPath);
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
            log("extension downloaded to %s", extensionPath);
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
