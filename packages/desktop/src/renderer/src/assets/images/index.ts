/**
 * 图片 URL 常量
 * 使用 CDN 链接替代本地静态图片
 */

export const IMAGE_URLS = {
  // 聊天面板背景
  chatPanelBgDark:
    "https://mdn.alipayobjects.com/huamei_puljkc/afts/img/A*ZcMfSrk-HkEAAAAAVoAAAAgAenyRAQ/original",
  chatPanelBgLight:
    "https://mdn.alipayobjects.com/huamei_puljkc/afts/img/A*Qx5YRqG-FrsAAAAARVAAAAgAenyRAQ/original",

  // Logo
  logoDark:
    "https://mdn.alipayobjects.com/huamei_puljkc/afts/img/A*jpbTRowbpecAAAAAQbAAAAgAenyRAQ/original",
  logo: "https://mdn.alipayobjects.com/huamei_puljkc/afts/img/A*OWxgSqKL5BoAAAAAQIAAAAgAenyRAQ/original",

  // 空状态图片
  empty1:
    "https://mdn.alipayobjects.com/huamei_puljkc/afts/img/A*q5AJSJfKmUYAAAAAQIAAAAgAenyRAQ/original",
  empty1Dark:
    "https://mdn.alipayobjects.com/huamei_puljkc/afts/img/A*gDWRT4cwkr4AAAAAQIAAAAgAenyRAQ/original",
  empty2:
    "https://mdn.alipayobjects.com/huamei_puljkc/afts/img/A*9AAKQb8_7OwAAAAAQHAAAAgAenyRAQ/original",
  empty2Dark:
    "https://mdn.alipayobjects.com/huamei_puljkc/afts/img/A*GoeWRogPudgAAAAAQGAAAAgAenyRAQ/original",

  // Debug 图标
  debugLight:
    "https://mdn.alipayobjects.com/huamei_puljkc/afts/img/A*2w3rT5nSC_4AAAAAQRAAAAgAenyRAQ/original",
  debugDark:
    "https://mdn.alipayobjects.com/huamei_puljkc/afts/img/A*vdyuSb8Eu5wAAAAAQVAAAAgAenyRAQ/original",
} as const;

/**
 * 根据主题获取聊天面板背景图
 */
export function getChatPanelBgUrl(theme: "dark" | "light" | undefined): string {
  return theme === "dark" ? IMAGE_URLS.chatPanelBgDark : IMAGE_URLS.chatPanelBgLight;
}

/**
 * 根据主题获取 Logo
 */
export function getLogoUrl(theme: "dark" | "light" | undefined): string {
  return theme === "dark" ? IMAGE_URLS.logoDark : IMAGE_URLS.logo;
}

/**
 * 根据主题获取 empty1 图片
 */
export function getEmpty1Url(theme: "dark" | "light" | undefined): string {
  return theme === "dark" ? IMAGE_URLS.empty1Dark : IMAGE_URLS.empty1;
}

/**
 * 根据主题获取 empty2 图片
 */
export function getEmpty2Url(theme: "dark" | "light" | undefined): string {
  return theme === "dark" ? IMAGE_URLS.empty2Dark : IMAGE_URLS.empty2;
}
