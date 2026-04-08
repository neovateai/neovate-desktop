import { oc, type } from "@orpc/contract";
import { z } from "zod";

import type { AppConfig } from "./types";

// Value schemas for each key
const themeValueSchema = z.enum(["system", "light", "dark"]);
const themeStyleValueSchema = z.enum(["default", "claude", "codex", "nord"]);
const sendMessageWithValueSchema = z.enum(["enter", "cmdEnter"]);
const appFontSizeValueSchema = z.number().min(12).max(20);
const terminalFontSizeValueSchema = z.number().min(8).max(32);
const terminalFontValueSchema = z.string();
const booleanValueSchema = z.boolean();
const localeValueSchema = z.enum(["system", "en-US", "zh-CN"]);
const keybindingsValueSchema = z.record(z.string(), z.string());
const permissionModeValueSchema = z.enum(["default", "acceptEdits", "bypassPermissions"]);
const notificationSoundValueSchema = z.enum(["off", "default", "Glass", "Ping", "Pop", "Funk"]);
const agentLanguageValueSchema = z.enum([
  "English",
  "Chinese",
  "Japanese",
  "Korean",
  "Spanish",
  "French",
]);
const sidebarOrganizeValueSchema = z.enum(["byProject", "chronological"]);
const sidebarSortByValueSchema = z.enum(["created", "updated"]);

export const configContract = {
  get: oc.output(type<AppConfig>()),

  getGlobalModelSelection: oc.output(type<{ providerId?: string; model?: string }>()),

  setGlobalModelSelection: oc
    .input(
      z.object({
        providerId: z.string().nullable(),
        model: z.string().nullable(),
      }),
    )
    .output(type<void>()),

  set: oc
    .input(
      z.union([
        z.object({ key: z.literal("theme"), value: themeValueSchema }),
        z.object({ key: z.literal("themeStyle"), value: themeStyleValueSchema }),
        z.object({ key: z.literal("locale"), value: localeValueSchema }),
        z.object({ key: z.literal("runOnStartup"), value: booleanValueSchema }),
        z.object({ key: z.literal("multiProjectSupport"), value: booleanValueSchema }),
        z.object({ key: z.literal("appFontSize"), value: appFontSizeValueSchema }),
        z.object({ key: z.literal("terminalFontSize"), value: terminalFontSizeValueSchema }),
        z.object({ key: z.literal("terminalFont"), value: terminalFontValueSchema }),
        z.object({ key: z.literal("developerMode"), value: booleanValueSchema }),
        z.object({ key: z.literal("showSessionInitStatus"), value: booleanValueSchema }),
        z.object({ key: z.literal("sendMessageWith"), value: sendMessageWithValueSchema }),
        z.object({ key: z.literal("agentLanguage"), value: agentLanguageValueSchema }),
        z.object({ key: z.literal("permissionMode"), value: permissionModeValueSchema }),
        z.object({ key: z.literal("notificationSound"), value: notificationSoundValueSchema }),
        z.object({ key: z.literal("keybindings"), value: keybindingsValueSchema }),
        z.object({ key: z.literal("sidebarOrganize"), value: sidebarOrganizeValueSchema }),
        z.object({ key: z.literal("tokenOptimization"), value: booleanValueSchema }),
        z.object({ key: z.literal("networkInspector"), value: booleanValueSchema }),
        z.object({ key: z.literal("keepAwake"), value: booleanValueSchema }),
        z.object({ key: z.literal("preWarmSessions"), value: booleanValueSchema }),
        z.object({ key: z.literal("auxiliaryModelSelection"), value: z.string() }),
        z.object({ key: z.literal("claudeCodeBinPath"), value: z.string() }),
        z.object({ key: z.literal("sidebarSortBy"), value: sidebarSortByValueSchema }),
        z.object({
          key: z.literal("skillsRegistries"),
          value: z.array(z.object({ url: z.string().url() })),
        }),
        z.object({
          key: z.literal("npmRegistry"),
          value: z.string().url().or(z.literal("")),
        }),
      ]),
    )
    .output(type<void>()),
};
