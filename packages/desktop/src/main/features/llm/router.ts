import { ORPCError, implement } from "@orpc/server";

import type { AppContext } from "../../router";

import { llmContract } from "../../../shared/features/llm/contract";

const os = implement({ llm: llmContract }).$context<AppContext>();

function toORPCError(err: unknown): never {
  if (err instanceof ORPCError) throw err;
  throw new ORPCError("BAD_REQUEST", {
    defined: true,
    message: err instanceof Error ? err.message : String(err),
  });
}

export const llmRouter = os.llm.router({
  isConfigured: os.llm.isConfigured.handler(({ context }) => {
    return { configured: context.llmService.isConfigured() };
  }),

  query: os.llm.query.handler(async ({ input, signal, context }) => {
    const { prompt, model, maxTokens, system, temperature } = input;
    try {
      const content = await context.llmService.query(prompt, {
        model,
        maxTokens,
        system,
        temperature,
        signal,
      });
      return { content };
    } catch (err) {
      toORPCError(err);
    }
  }),

  queryMessages: os.llm.queryMessages.handler(async ({ input, signal, context }) => {
    const { messages, model, maxTokens, system, temperature } = input;
    try {
      return await context.llmService.queryMessages(messages, {
        model,
        maxTokens,
        system,
        temperature,
        signal,
      });
    } catch (err) {
      toORPCError(err);
    }
  }),
});
