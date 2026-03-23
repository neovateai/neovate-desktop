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

  start(port: number, maxRetries: number = 10): Promise<number> {
    return new Promise((resolve, reject) => {
      const tryListen = (currentPort: number, attempt: number) => {
        this.server = net.createServer((socket) => {
          let currentCwd: string | null = null;
          // response or events
          socket.on("data", async (raw) => {
            try {
              const data = JSON.parse(raw.toString());
              log("received", data);
              const { operationType, params, cwd, result, requestId } = data || {};
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
              if (!operationType || !cwd) {
                return;
              }
              // 首次连接或cwd变化时更新映射
              if (currentCwd !== cwd) {
                if (currentCwd) {
                  this.clients.delete(currentCwd);
                }
                currentCwd = cwd;
                this.clients.set(cwd, socket);
              }
              // handle events/request data from extension.
              const handler = this.handlers.get(operationType);
              if (handler) {
                try {
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
              } else {
                const response = JSON.stringify({
                  success: false,
                  error: `No handler registered for operation: ${operationType}`,
                  requestId: data.requestId,
                });
                socket.write(Buffer.from(response));
                socket.write("\n\n");
              }
            } catch (error) {
              const response = JSON.stringify({
                success: false,
                error: "Invalid JSON format",
              });
              socket.write(Buffer.from(response));
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

        this.server.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EADDRINUSE" && attempt < maxRetries) {
            log("port %d in use, trying %d", currentPort, currentPort + 1);
            this.server?.close();
            tryListen(currentPort + 1, attempt + 1);
          } else {
            reject(err);
          }
        });

        this.server.listen(currentPort, () => {
          log("server started on port %d", currentPort);
          resolve(currentPort);
        });
      };

      tryListen(port, 0);
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
      const data = Buffer.from(
        JSON.stringify({
          ...request,
          requestId,
          cwd,
        }),
      );

      const client = this.clients.get(cwd);
      if (!client || client.destroyed) {
        reject(new Error(`No active client for cwd: ${cwd}`));
        return;
      }

      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // 存储pending请求
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
      });

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

// TODO: editor 链接点击通知
// /** trigger by click link in editor */
// bridgeServer.register('link.open', async (params, cwd, webContents) => {
//   if (webContents) {
//     const caller = getRendererCaller<IPCRendererHandlers>(webContents);
//     caller.browser.open.send(params.url);
//     return { success: true, data: { msg: 'called success' } };
//   }
//   return { success: false, data: {}, errorMsg: `WebContents not found` };
// });
