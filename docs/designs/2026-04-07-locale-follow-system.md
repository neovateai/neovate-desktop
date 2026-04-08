# Locale "Follow System" Default

## Problem

语言设置只有 "English" 和 "简体中文" 两个固定选项，默认硬编码为 `en-US`。用户无法让应用跟随操作系统语言自动切换，这与主题设置（已支持 `system`）不一致，也不符合主流桌面应用的惯例（VS Code、Chrome 等均提供跟随系统选项）。

## Solution

为 locale 设置新增 `"system"` 选项（跟随系统），作为默认值。运行时利用 i18next 内置的 `LanguageDetector` 从 `navigator.language` 解析实际语言，无需自行实现检测逻辑。

## Design

### 类型分层

引入 `LocalePreference` 区分"用户偏好"和"实际语言"：

```
LocalePreference = "system" | "en-US" | "zh-CN"   ← 存储层（用户选择的值）
Locales           = "en-US" | "zh-CN"              ← 运行时（i18n 实际使用的值）
```

`AppConfig.locale` 类型从 `Locales` 改为 `LocalePreference`。

### i18n Manager 行为变更

当前 `init()` 逻辑：

```
savedLocale 存在？ → lng: savedLocale（跳过检测）
savedLocale 不存在？ → LanguageDetector 检测 → 写回 store
```

变更后：

```
savedLocale === "system" 或不存在？ → LanguageDetector 检测 → 不写回 store
savedLocale 是具体语言？           → lng: savedLocale（跳过检测）
```

`applyUILocale()` 同理：收到 `"system"` 时不指定 `lng`，让检测器工作。

### 设置 UI

语言选项从 2 个变为 3 个：

| 值         | en-US 标签    | zh-CN 标签 |
| ---------- | ------------- | ---------- |
| `"system"` | Follow System | 跟随系统   |
| `"en-US"`  | English       | English    |
| `"zh-CN"`  | 简体中文      | 简体中文   |

参照主题设置的实现方式，在组件内用 `t()` 构建选项列表。

### 数据迁移

无需迁移。已有用户的配置文件中 `locale` 值为 `"en-US"` 或 `"zh-CN"`，仍然有效。仅新安装用户默认为 `"system"`。

## Affected Files

| 文件                                                       | 变更                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `src/shared/features/config/types.ts`                      | 新增 `LocalePreference` 类型，`AppConfig.locale` 改类型 |
| `src/shared/features/config/contract.ts`                   | `localeValueSchema` 加 `"system"`                       |
| `src/renderer/src/core/i18n/locales.ts`                    | 导出 `LocalePreference`，`localeOptions` 加 system      |
| `src/renderer/src/core/i18n/manager.ts`                    | `init()` / `applyUILocale()` 处理 `"system"`            |
| `src/renderer/src/features/settings/.../general-panel.tsx` | 内联构建选项，handler 类型更新                          |
| `src/renderer/src/features/config/store.ts`                | 默认值 → `"system"`                                     |
| `src/main/features/config/config-store.ts`                 | 默认值 → `"system"`                                     |
| `src/renderer/src/locales/en-US.json`                      | 加 `settings.general.language.system`                   |
| `src/renderer/src/locales/zh-CN.json`                      | 加 `settings.general.language.system`                   |
