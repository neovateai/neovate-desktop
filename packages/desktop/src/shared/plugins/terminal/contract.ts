import { oc, type } from "@orpc/contract";

export const terminalContract = {
  spawn: oc
    .input(type<{ cwd?: string; cols: number; rows: number }>())
    .output(type<{ sessionId: string }>()),
  write: oc.input(type<{ sessionId: string; data: string }>()).output(type<void>()),
  resize: oc.input(type<{ sessionId: string; cols: number; rows: number }>()).output(type<void>()),
  kill: oc.input(type<{ sessionId: string }>()).output(type<void>()),
  // stream is untyped — yields string chunks via async generator; cast in renderer
};
