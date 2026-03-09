import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./constants";

const OVERRIDE_SETTINGS = {
  /** 隐藏右上角布局控制按钮 */
  "workbench.layoutControl.enabled": false,
  /** 编辑器菜单 */
  "window.menuBarVisibility": "toggle",
  /** 隐藏底部状态栏 */
  "workbench.statusBar.visible": false,
  /** 侧边栏放在右侧 */
  "workbench.sideBar.location": "right",
  /** 隐藏辅助侧边栏 */
  "workbench.secondarySideBar.defaultVisibility": "hidden",
  /** 侧边栏菜单: 放在top的话会导致title 无法隐藏 */
  "workbench.activityBar.location": "hidden",
  /** 隐藏顶部操作能力 */
  "window.commandCenter": false,
  /** 隐藏顶部标题路径文本 */
  "window.title": "",
  /** 禁用 ai chat 特性 */
  "chat.disableAIFeatures": true,
  /** 避免出现工作区信任弹窗 */
  "security.workspace.trust.enabled": false,
  /** 禁用空入口时的欢迎特性 */
  "workbench.startupEditor": "none",
  /** 行号前面的空间，用于小灯泡 */
  "editor.glyphMargin": false,
  /** 代码折叠功能 */
  // 'editor.folding': false,
  /** 隐藏编辑器小地图 */
  "editor.minimap.enabled": false,
  /** 自动主题 */
  "window.autoDetectColorScheme": false,
  // 'workbench.editor.showTabs': 'multiple',
  // 'workbench.editor.editorActionsLocation': 'hidden',
  // 'breadcrumbs.enabled': false,
  // 'editor.stickyScroll.enabled': false,
  // 'editor.fontFamily':
  //   "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace",
  // 'editor.fontSize': 13,
  // 'editor.lineHeight': 1.4,
  // 'telemetry.telemetryLevel': 'off',
  /** 不生效的属性 */
  // 'window.customTitleBarVisibility': 'hidden',
  // 'workbench.sideBar.visible': false,
  // 'workbench.activityBar.visible': false,
  // 'window.titleBarStyle': 'native',
};

export async function overrideCodeServerSettings(): Promise<void> {
  const settingsDir = path.join(DATA_DIR, "User");
  const settingsPath = path.join(settingsDir, "settings.json");

  try {
    // 确保目录存在
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }
    // 读取现有设置
    let existingSettings = {};
    if (fs.existsSync(settingsPath)) {
      const fileContent = fs.readFileSync(settingsPath, "utf-8");
      try {
        existingSettings = JSON.parse(fileContent);
      } catch (parseError) {
        console.warn("Failed to parse existing settings.json, using empty object");
      }
    }

    const mergedSettings = {
      ...existingSettings,
      ...OVERRIDE_SETTINGS,
    };

    // 写入合并后的设置
    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2));

    console.log("Code-server settings updated successfully");
  } catch (error) {
    console.error("Failed to update code-server settings:", error);
  }
}
