import { oc, type } from "@orpc/contract";
import { z } from "zod";
import type { AppConfig } from "./types";

// Value schemas for each key
const themeValueSchema = z.enum(["system", "light", "dark"]);
const sendMessageWithValueSchema = z.enum(["enter", "cmdEnter"]);
const terminalFontSizeValueSchema = z.number().min(8).max(32);
const terminalFontValueSchema = z.string();
const booleanValueSchema = z.boolean();
const localeValueSchema = z.enum(["en-US", "zh-CN"]);
const keybindingsValueSchema = z.record(z.string(), z.string());
const approvalModeValueSchema = z.enum(["default", "autoEdit", "yolo"]);
const notificationSoundValueSchema = z.enum(["off", "default", "Glass", "Ping", "Pop", "Funk"]);
const agentLanguageValueSchema = z.enum([
  "English",
  "Chinese",
  "Japanese",
  "Korean",
  "Spanish",
  "French",
]);

export const configContract = {
  get: oc.output(type<AppConfig>()),

  set: oc
    .input(
      z.union([
        z.object({ key: z.literal("theme"), value: themeValueSchema }),
        z.object({ key: z.literal("locale"), value: localeValueSchema }),
        z.object({ key: z.literal("runOnStartup"), value: booleanValueSchema }),
        z.object({ key: z.literal("multiProjectSupport"), value: booleanValueSchema }),
        z.object({ key: z.literal("terminalFontSize"), value: terminalFontSizeValueSchema }),
        z.object({ key: z.literal("terminalFont"), value: terminalFontValueSchema }),
        z.object({ key: z.literal("developerMode"), value: booleanValueSchema }),
        z.object({ key: z.literal("sendMessageWith"), value: sendMessageWithValueSchema }),
        z.object({ key: z.literal("agentLanguage"), value: agentLanguageValueSchema }),
        z.object({ key: z.literal("approvalMode"), value: approvalModeValueSchema }),
        z.object({ key: z.literal("notificationSound"), value: notificationSoundValueSchema }),
        z.object({ key: z.literal("keybindings"), value: keybindingsValueSchema }),
      ]),
    )
    .output(type<void>()),
};
