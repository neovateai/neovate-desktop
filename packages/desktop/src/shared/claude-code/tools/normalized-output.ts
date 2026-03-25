import { z } from "zod";

export const normalizedToolOutputSchema = z.object({
  text: z.string(),
  images: z.array(
    z.object({
      url: z.string(),
      mediaType: z.string(),
      filename: z.string().optional(),
    }),
  ),
});

export type NormalizedToolOutput = z.infer<typeof normalizedToolOutputSchema>;
