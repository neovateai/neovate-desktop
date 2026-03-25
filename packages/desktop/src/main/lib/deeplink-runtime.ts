export type DeepLinkRuntimeState =
  | { kind: "idle" }
  | { kind: "buffered"; url: string }
  | { kind: "handling"; url: string };

type DeepLinkRuntimeOptions = {
  handle: (url: string) => Promise<void>;
  log?: (event: string, meta?: Record<string, unknown>) => void;
};

export function createDeepLinkRuntime(options: DeepLinkRuntimeOptions) {
  let ready = false;
  let state: DeepLinkRuntimeState = { kind: "idle" };

  const setState = (next: DeepLinkRuntimeState) => {
    state = next;
  };

  const log = (event: string, meta?: Record<string, unknown>) => {
    options.log?.(event, meta);
  };

  const processUrl = async (url: string): Promise<void> => {
    setState({ kind: "handling", url });
    log("handling", { url });
    try {
      await options.handle(url);
    } finally {
      setState({ kind: "idle" });
      log("idle", { url });
    }
  };

  return {
    async receive(url: string): Promise<void> {
      if (!ready) {
        if (state.kind === "idle") {
          setState({ kind: "buffered", url });
          log("buffered", { url });
          return;
        }

        log("dropped", { url, reason: "not_ready", state: state.kind });
        return;
      }

      if (state.kind !== "idle") {
        log("dropped", { url, reason: "busy", state: state.kind });
        return;
      }

      await processUrl(url);
    },

    async markReady(): Promise<void> {
      ready = true;
      log("ready");

      if (state.kind !== "buffered") {
        return;
      }

      const { url } = state;
      await processUrl(url);
    },

    getState(): DeepLinkRuntimeState {
      return state;
    },
  };
}
