import type { WebContents } from "electron";

import debug from "debug";
import { EventEmitter } from "events";
import net from "net";
import { randomUUID } from "node:crypto";

const log = debug("neovate:editor:bridge");

interface IBridgeRequestParams {
  operationType: string;
  cwd: string;
  params: Record<string, any>;
}

export class ExtensionBridgeServer extends EventEmitter {
  private server: net.Server | null = null;
  private clients = new Map<string, net.Socket>();
  private handlers = new Map<
    string,
    (params: IBridgeRequestParams["params"], cwd: string) => Promise<any>
  >();
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: any) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        let currentCwd: string | null = null;
        // response or events
        socket.on("data", async (raw) => {
          const onData = async (dataStr: string) => {
            try {
              const data = JSON.parse(dataStr);
              log("received", data);
              const { operationType, msgType, params, cwd, result, requestId } = data || {};
              // handle response data from extension (with requestId of current instance)
              if (requestId && this.pendingRequests.has(requestId)) {
                const pending = this.pendingRequests.get(requestId);
                if (pending) {
                  clearTimeout(pending.timeout);
                  this.pendingRequests.delete(requestId);
                  pending.resolve(result as { success: boolean; data: Record<string, any> });
                  return;
                }
              }
              if (!operationType || !cwd || msgType === "RESPONSE") {
                return;
              }
              // handle events/request data from extension.
              const handler = this.handlers.get(operationType);
              if (msgType === "PUSH") {
                if (operationType === "connected") {
                  currentCwd = cwd;
                  this.clients.set(cwd, socket);
                }
                if (handler) {
                  await handler(params, cwd);
                }
              } else {
                try {
                  if (!handler) {
                    throw new Error(`No handler registered for operation: ${operationType}`);
                  }
                  const result = await handler(params, cwd);
                  const response = JSON.stringify({
                    ...result,
                    requestId: data.requestId,
                  });
                  socket.write(Buffer.from(response));
                } catch (error) {
                  const response = JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    requestId: data.requestId,
                  });
                  socket.write(Buffer.from(response));
                }
                socket.write("\n\n"); // 分隔符避免粘包
              }
            } catch (error) {
              const response = JSON.stringify({
                success: false,
                error: "Invalid JSON format:" + raw.toString(),
              });
              log("Invalid bridge data", error, raw);
              socket.write(Buffer.from(response));
              socket.write("\n\n");
            }
          };
          try {
            const content = raw.toString();
            const jsonList = content.split("\n\n"); // 通过分隔符避免socket 消息粘包
            for (const fragment of jsonList) {
              if (!fragment.trim()) continue;
              await onData(fragment);
            }
          } catch (error) {
            console.error("Unknown request data:", {
              error,
              text: raw.toString(),
            });
          }
        });

        socket.on("close", () => {
          log("client disconnected", { cwd: currentCwd });
          if (currentCwd) {
            this.clients.delete(currentCwd);
          }
          // 清理该cwd相关的所有pending请求
          for (const [requestId, pending] of this.pendingRequests.entries()) {
            pending.reject(new Error("Connection closed"));
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(requestId);
          }
        });
      });

      this.server.once("error", reject);

      this.server.listen(port, () => {
        log("server started on port %d", port);
        resolve();
      });
    });
  }

  send<T extends Record<string, any>>(
    request: Omit<IBridgeRequestParams, "cwd">,
    cwd: string,
    timeoutMs: number = 5000,
  ): Promise<{
    success: boolean;
    data: T;
  }> {
    log("sending request", { operationType: request.operationType, cwd });
    return new Promise((resolve, reject) => {
      const requestId = randomUUID();
      const data = Buffer.from(JSON.stringify({ ...request, requestId, cwd }));

      const client = this.clients.get(cwd);
      if (!client) {
        reject(new Error(`No active client for cwd: ${cwd}`));
        return;
      }
      if (client.destroyed) {
        reject(new Error(`Client destroyed for cwd: ${cwd}`));
        return;
      }

      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // 存储pending请求
      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // 发送请求
      client.write(data);
      client.write("\n\n");
    });
  }

  register<T>(
    operationType: string,
    handler: (
      params: IBridgeRequestParams["params"],
      cwd: string,
      webContents?: WebContents,
    ) => Promise<T>,
  ) {
    this.handlers.set(operationType, handler);
  }

  isConnected(cwd: string): boolean {
    const client = this.clients.get(cwd);
    return client != null && !client.destroyed;
  }

  stop() {
    log("stopping bridge server");
    if (this.server) {
      this.server.close();
      this.clients.forEach((client) => {
        client.destroy();
      });
      this.clients.clear();
      this.handlers.clear();

      // 清理所有pending请求
      for (const [requestId, pending] of this.pendingRequests.entries()) {
        pending.reject(new Error("Server stopped"));
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(requestId);
      }
    }
  }
}

export function waitForConnect(bridge: ExtensionBridgeServer) {
  const CONNECT_TIMEOUT = 15_000;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Connection timeout: extension bridge did not respond within 15s"));
    }, CONNECT_TIMEOUT);

    bridge.register("connected", async (params) => {
      clearTimeout(timeout);
      resolve(params);
    });
  });
}
