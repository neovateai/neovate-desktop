import { oc, type } from "@orpc/contract";

export const browserContract = {
  openDevTools: oc
    .input(type<{ pageWebContentsId: number; devToolsWebContentsId: number }>())
    .output(type<void>()),
  closeDevTools: oc.input(type<{ pageWebContentsId: number }>()).output(type<void>()),
};
