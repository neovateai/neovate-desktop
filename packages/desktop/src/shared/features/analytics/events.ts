import { z } from "zod";

export const programmaticEventSchemas = {
  "ui.page.viewed": z.object({ page: z.string() }),
} satisfies Record<`${string}.${string}.${string}`, z.ZodObject<z.ZodRawShape>>;

export type ProgrammaticEventName = keyof typeof programmaticEventSchemas;
export type ProgrammaticEventProperties<T extends ProgrammaticEventName> = z.infer<
  (typeof programmaticEventSchemas)[T]
>;
