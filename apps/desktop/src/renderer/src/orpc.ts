import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/message-port";
import type { ContractRouterClient } from "@orpc/contract";
import { contract } from "../../shared/contract";

const { port1: clientPort, port2: serverPort } = new MessageChannel();
window.postMessage("start-orpc-client", "*", [serverPort]);
clientPort.start();

const link = new RPCLink({ port: clientPort });
export const client = createORPCClient<ContractRouterClient<typeof contract>>(link);
