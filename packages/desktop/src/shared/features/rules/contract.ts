import { oc, type } from "@orpc/contract";
import { z } from "zod";

export type ResolvedReference = {
  filename: string;
  fullPath: string;
  exists: boolean;
  lineCount: number;
  content: string;
};

export const rulesContract = {
  readGlobal: oc.output(type<{ content: string; path: string }>()),
  writeGlobal: oc.input(z.object({ content: z.string() })).output(type<{ success: boolean }>()),
  watchGlobal: oc.output(type<{ mtime: number }>()),
  openFolder: oc.output(type<{ success: boolean }>()),
  resolveReferences: oc
    .input(z.object({ filenames: z.array(z.string()) }))
    .output(type<{ references: ResolvedReference[] }>()),
};
