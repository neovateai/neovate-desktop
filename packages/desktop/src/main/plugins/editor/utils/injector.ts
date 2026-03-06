import path from "node:path";
import fs from "node:fs";
import { getCodeServerBinaryPath } from "./constants";

/** 通过修改产物的方式实现强制样式修改 */
const OVERWRITE_CSS = `
/* modify the empty icon */
.monaco-workbench .part.editor>.content .editor-group-container>.editor-group-watermark .letterpress {
  background-image: url('https://mdn.alipayobjects.com/huamei_9rin5s/afts/img/DFf4TIiXtU4AAAAAerAAAAgADiB8AQFr/original')!important;
}
/* modify the empty icon: [dark theme] */
.vs-dark.monaco-workbench .part.editor>.content .editor-group-container>.editor-group-watermark .letterpress {
  background-image: url('https://mdn.alipayobjects.com/huamei_9rin5s/afts/img/MJYNQ4LBABwAAAAAeYAAAAgADiB8AQFr/original')!important;
}
/* hide the default shortcuts tips */
.monaco-workbench .part.editor>.content .editor-group-container>.editor-group-watermark .shortcuts .watermark-box {
  display: none;
}
/* add simple custom tip text */
.monaco-workbench .part.editor>.content .editor-group-container>.editor-group-watermark .shortcuts::after {
  content: "No File Opened";
  text-align: center;
  display: block;
}
/* hide sidebar */
.monaco-workbench .sidebar {
  display: none!important;
}
`;

export function injectStyle() {
  try {
    const resource = getCodeServerBinaryPath();
    const workbenchDir = path.join(
      resource,
      "lib",
      "vscode",
      "out",
      "vs",
      "code",
      "browser",
      "workbench",
    );

    if (!fs.existsSync(workbenchDir)) {
      throw new Error(`workbenchDir not found`);
    }
    const workbenchHtmlPath = path.join(workbenchDir, "workbench.html");
    if (!fs.existsSync(workbenchHtmlPath)) {
      throw new Error(`workbench.html not found`);
    }
    const overrideCssPath = path.join(workbenchDir, "neovate.overwrite.css");
    fs.writeFileSync(overrideCssPath, OVERWRITE_CSS);

    // 读取并修改 workbench.html
    const workbenchHtmlContent = fs.readFileSync(workbenchHtmlPath, "utf-8");
    const linkTag =
      '<link rel="stylesheet" href="{{WORKBENCH_WEB_BASE_URL}}/out/vs/code/browser/workbench/neovate.overwrite.css">';

    // 检查是否已经存在该link标签
    if (!workbenchHtmlContent.includes("neovate.overwrite.css")) {
      // 在head标签结束前插入link标签
      const modifiedContent = workbenchHtmlContent.replace("</head>", `  ${linkTag}\n</head>`);
      fs.writeFileSync(workbenchHtmlPath, modifiedContent);
    }
  } catch (error) {
    console.error("Failed to inject style:", error);
  }
}
