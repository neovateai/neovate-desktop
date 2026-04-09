# Add Descriptions to Remote Control Platform Cards

**Date:** 2026-04-09
**Status:** Approved

## Problem

The Settings > Remote Control panel shows platform cards (Telegram, DingTalk, WeChat) with only a title. New users have no guidance on what each platform does or how to get started.

## Solution

Use the existing `SettingsGroup` `description` prop to show actionable guidance under each platform title. Descriptions tell the user **what they need to do first**, not just what the platform is.

Telegram and DingTalk descriptions include links to their respective setup pages (`@BotFather` and Developer Console), which requires changing `SettingsGroup`'s `description` prop from `string` to `ReactNode` and using `Trans` from react-i18next for embedded links.

External links work via `<a target="_blank">` — the app's `setWindowOpenHandler` in `browser-window-manager.ts` already intercepts these and routes through `shell.openExternal`. This is the established pattern used in `providers-panel.tsx`, `skill-discover-tab.tsx`, etc.

## Changes

### 1. `SettingsGroup` — widen `description` type

In `settings-group.tsx`, change the `description` prop from `string` to `ReactNode`. The render logic (`{description && ...}`) works as-is with `ReactNode`.

```diff
- description?: string;
+ description?: ReactNode;
```

### 2. `PlatformCard` in `remote-control-panel.tsx`

WeChat has no link, so it uses a plain i18n string. Telegram and DingTalk use `Trans` to embed links.

**Important:** Use `<docLink>` (not `<link>`) in i18n strings — `<link>` is a real HTML element and `Trans` renders it invisibly.

```tsx
const linkClass = "underline underline-offset-2 text-muted-foreground hover:text-foreground";

const description =
  platform.id === "telegram" ? (
    <Trans
      i18nKey="settings.remoteControl.telegram.description"
      components={{
        docLink: <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className={linkClass} />,
      }}
    />
  ) : platform.id === "dingtalk" ? (
    <Trans
      i18nKey="settings.remoteControl.dingtalk.description"
      components={{
        docLink: <a href="https://open.dingtalk.com/" target="_blank" rel="noopener noreferrer" className={linkClass} />,
      }}
    />
  ) : (
    t("settings.remoteControl.wechat.description")
  );

<SettingsGroup title={platform.displayName} description={description}>
```

### 3. i18n keys

**en-US.json:**

```json
"settings.remoteControl.telegram.description": "Control Neovate via Telegram. Create a bot with <docLink>@BotFather</docLink>, then paste the token below.",
"settings.remoteControl.dingtalk.description": "Control Neovate via DingTalk. Create a robot in the <docLink>Developer Console</docLink>, then enter the credentials below.",
"settings.remoteControl.wechat.description": "Control Neovate via WeChat. Click Connect to scan a QR code with your WeChat app."
```

**zh-CN.json:**

```json
"settings.remoteControl.telegram.description": "通过 Telegram 控制 Neovate。使用 <docLink>@BotFather</docLink> 创建机器人，然后在下方粘贴 Token。",
"settings.remoteControl.dingtalk.description": "通过钉钉控制 Neovate。在<docLink>开发者后台</docLink>创建机器人，然后在下方填写凭证。",
"settings.remoteControl.wechat.description": "通过微信控制 Neovate。点击连接后使用微信扫描二维码。"
```

## Files Touched

- `packages/desktop/src/renderer/src/features/settings/components/settings-group.tsx` — change `description` type to `ReactNode`
- `packages/desktop/src/renderer/src/features/settings/components/panels/remote-control-panel.tsx` — add description to `SettingsGroup`, use `Trans` for DingTalk
- `packages/desktop/src/renderer/src/locales/en-US.json` — 3 new keys
- `packages/desktop/src/renderer/src/locales/zh-CN.json` — 3 new keys

## Visual

```
┌───────────────────────────────────────────────────────┐
│ Telegram                                              │
│ Control Neovate via Telegram. Create a bot with       │
│ @BotFather (link), then paste the token below.        │
│                                                       │
│ Enabled                  [toggle] Connected           │
│ Bot Token                [••••••••] [Save]            │
│ ...                                                   │
├───────────────────────────────────────────────────────┤
│ DingTalk                                              │
│ Control Neovate via DingTalk. Create a robot in the   │
│ Developer Console (link), then enter the credentials  │
│ below.                                                │
│                                                       │
│ Enabled                  [toggle] Connected           │
│ App Key                  [••••••••]                   │
│ ...                                                   │
├───────────────────────────────────────────────────────┤
│ WeChat                                                │
│ Control Neovate via WeChat. Click Connect to scan a   │
│ QR code with your WeChat app.                         │
│                                                       │
│ Enabled                  [toggle] Connected           │
│ Connection               [Connect]                    │
│ ...                                                   │
└───────────────────────────────────────────────────────┘
```

The description renders as `text-xs text-muted-foreground/70` via the existing `SettingsGroup` component — subtle, consistent with other settings panels. Links inherit the muted color and use underline for affordance. External links open in the system browser via the existing `setWindowOpenHandler` → `shell.openExternal` pipeline.
