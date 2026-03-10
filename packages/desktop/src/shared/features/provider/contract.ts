import { oc, type } from "@orpc/contract";
import { z } from "zod";

import type { ModelScope } from "../agent/types";
import type { Provider } from "./types";

const providerModelEntrySchema = z.object({ displayName: z.string().optional() });

const providerModelMapSchema = z.object({
  model: z.string().optional(),
  haiku: z.string().optional(),
  opus: z.string().optional(),
  sonnet: z.string().optional(),
});

export const providerContract = {
  list: oc.output(type<Provider[]>()),

  get: oc.input(z.object({ id: z.string() })).output(type<Provider | null>()),

  create: oc
    .input(
      z.object({
        name: z.string().min(1),
        baseURL: z.string().url(),
        apiKey: z.string().min(1),
        models: z
          .record(z.string(), providerModelEntrySchema)
          .refine((m) => Object.keys(m).length > 0, "At least one model required"),
        modelMap: providerModelMapSchema,
        envOverrides: z.record(z.string(), z.string()).optional(),
      }),
    )
    .output(type<Provider>()),

  update: oc
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        enabled: z.boolean().optional(),
        baseURL: z.string().url().optional(),
        apiKey: z.string().min(1).optional(),
        models: z
          .record(z.string(), providerModelEntrySchema)
          .refine((m) => Object.keys(m).length > 0, "At least one model required")
          .optional(),
        modelMap: providerModelMapSchema.optional(),
        envOverrides: z.record(z.string(), z.string()).optional(),
      }),
    )
    .output(type<Provider>()),

  remove: oc.input(z.object({ id: z.string() })).output(type<void>()),

  setSelection: oc
    .input(
      z.object({
        sessionId: z.string(),
        providerId: z.string().nullable(),
        model: z.string().nullable(),
        scope: z.enum(["session", "project", "global"]),
      }),
    )
    .output(
      type<{
        providerId?: string;
        model?: string;
        providerScope?: ModelScope;
        modelScope?: ModelScope;
      }>(),
    ),
};
