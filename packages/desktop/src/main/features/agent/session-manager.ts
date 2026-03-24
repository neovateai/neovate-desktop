import type {
  Query,
  Options,
  SDKUserMessage,
  SDKSessionInfo,
  PermissionMode as SDKPermissionMode,
} from "@anthropic-ai/claude-agent-sdk";

import { EventPublisher } from "@orpc/server";
import debug from "debug";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

import type {
  ClaudeCodeUIEvent,
  ClaudeCodeUIMessage,
  ClaudeCodeUIDispatch,
  ClaudeCodeUIDispatchResult,
} from "../../../shared/claude-code/types";
import type {
  ActiveSessionInfo,
  ModelScope,
  RewindFilesResult,
  SessionInfo,
} from "../../../shared/features/agent/types";

const execFileAsync = promisify(execFile);
import type { Provider } from "../../../shared/features/provider/types";
import type { ConfigStore } from "../config/config-store";
import type { ProjectStore } from "../project/project-store";
import type { RequestTracker } from "./request-tracker";

import { shellEnvService } from "../../core/shell-service";
import {
  resolveBunPath,
  resolveInterceptorPath,
  resolveRtkPath,
  resolveSDKCliPath,
  detectRtkHookInSettings,
} from "./claude-code-utils";
import { readModelSetting, readProviderSetting, readProviderModelSetting } from "./claude-settings";
import { Pushable } from "./pushable";
import { SDKMessageTransformer, toUIEvent } from "./sdk-message-transformer";
import { sessionMessagesToUIMessages } from "./utils/session-messages-to-ui-messages";

const log = debug("neovate:session-manager");
const rtkLog = debug("neovate:rtk");

/** List .jsonl files one level deep under `~/.claude/projects/` */
function listSessionFiles(filter?: string): string[] {
  const baseDir = path.join(homedir(), ".claude", "projects");
  let dirs: string[];
  try {
    dirs = readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
  const results: string[] = [];
  for (const dir of dirs) {
    try {
      const files = readdirSync(path.join(baseDir, dir));
      for (const f of files) {
        if (filter ? f === filter : f.endsWith(".jsonl")) {
          results.push(path.join(baseDir, dir, f));
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }
  return results;
}

/** Auto-cancel permission requests after 5 minutes of no UI response. */
export const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

/** Timeout for SDK initializationResult() to prevent hanging sessions. */
const INIT_TIMEOUT_MS = 10_000;

const ENV_BLOCKLIST = new Set([
  "ELECTRON_RUN_AS_NODE",
  "NODE_OPTIONS",
  "PATH",
  "HOME",
  "SHELL",
  "USER",
  "LD_PRELOAD",
  "DYLD_INSERT_LIBRARIES",
]);

export class SessionManager {
  // Single global publisher — sessionId is the channel key
  readonly eventPublisher = new EventPublisher<Record<string, ClaudeCodeUIEvent>>();

  // Per-session state
  private sessions = new Map<
    string,
    {
      input: Pushable<SDKUserMessage>;
      query: Query;
      cwd: string;
      providerId?: string;
      lastUserMessageId?: string;
      preTurnRef?: string;
      pendingRequests: Map<
        string,
        {
          resolve: (result: import("@anthropic-ai/claude-agent-sdk").PermissionResult) => void;
          timer: ReturnType<typeof setTimeout>;
        }
      >;
    }
  >();

  constructor(
    private configStore: ConfigStore,
    private projectStore: ProjectStore,
    private requestTracker: RequestTracker,
  ) {}

  /** Return all in-memory (active) sessions. */
  getActiveSessions(): ActiveSessionInfo[] {
    return Array.from(this.sessions.entries()).map(([sessionId, session]) => ({
      sessionId,
      cwd: session.cwd,
    }));
  }

  private queryOptions({
    sessionId,
    model,
    cwd,
  }: {
    sessionId: string;
    model?: string;
    cwd: string;
  }): Options {
    const cliPath = resolveSDKCliPath();
    return {
      sessionId,
      model,
      cwd,
      pathToClaudeCodeExecutable: cliPath,
      executable: "bun",
      settingSources: ["local", "project", "user"],
      enableFileCheckpointing: true,
      includePartialMessages: true,
      permissionMode: this.configStore.get("permissionMode") ?? "default",
      promptSuggestions: true,
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
      },
      tools: {
        type: "preset",
        preset: "claude_code",
      },
      canUseTool: async (toolName, input, { signal, ...options }) => {
        const requestId = randomUUID();
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error(`Unknown session: ${sessionId}`);

        const { promise, resolve } =
          Promise.withResolvers<import("@anthropic-ai/claude-agent-sdk").PermissionResult>();
        let settled = false;
        const settle = (
          result: import("@anthropic-ai/claude-agent-sdk").PermissionResult,
        ): boolean => {
          if (settled) return false;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          session.pendingRequests.delete(requestId);
          // SDK expects updatedInput on allow results to execute the tool
          resolve(
            result.behavior === "allow"
              ? { ...result, updatedInput: result.updatedInput ?? input }
              : result,
          );
          return true;
        };
        const timer = setTimeout(() => {
          if (settle({ behavior: "deny", message: "Permission request timed out" })) {
            this.eventPublisher.publish(sessionId, { kind: "request_settled", requestId });
          }
        }, PERMISSION_TIMEOUT_MS);
        const onAbort = () => {
          if (settle({ behavior: "deny", message: "Permission request cancelled" })) {
            this.eventPublisher.publish(sessionId, { kind: "request_settled", requestId });
          }
        };
        session.pendingRequests.set(requestId, { resolve: settle, timer });
        this.eventPublisher.publish(sessionId, {
          kind: "request",
          requestId,
          request: { type: "permission_request", toolName, input, options },
        });
        signal.addEventListener("abort", onAbort, { once: true });
        return promise;
      },
      stderr(data) {
        console.error("[claude-stderr]", data.trimEnd());
      },
    };
  }

  /** Start a new session. */
  async createSession(
    cwd: string,
    model?: string,
    explicitProviderId?: string | null,
  ): Promise<
    {
      sessionId: string;
      currentModel?: string;
      modelScope?: ModelScope;
      providerId?: string;
    } & Awaited<ReturnType<Query["initializationResult"]>>
  > {
    const sessionId = randomUUID();
    log(
      "createSession: sessionId=%s cwd=%s model=%s explicitProviderId=%s",
      sessionId,
      cwd,
      model ?? "(auto)",
      explicitProviderId ?? "(none)",
    );

    // Resolve provider: explicit param overrides settings chain
    // null = force no provider (SDK Default), undefined = use settings chain
    let provider: Provider | undefined;
    if (explicitProviderId === null) {
      log("createSession: explicit null providerId — forcing SDK Default");
    } else if (explicitProviderId) {
      const p = this.configStore.getProvider(explicitProviderId);
      if (p?.enabled) {
        provider = p;
        log("createSession: using explicit provider=%s", p.name);
      } else {
        log(
          "createSession: explicit provider id=%s not found or disabled, falling through",
          explicitProviderId,
        );
      }
    }
    if (explicitProviderId === undefined && !provider) {
      const providerSetting = readProviderSetting(
        sessionId,
        cwd,
        this.configStore,
        this.projectStore,
      );
      provider = providerSetting?.provider;
    }

    if (provider && !explicitProviderId) {
      log("createSession: resolved provider=%s from settings", provider.name);
    }

    // Resolve model: explicit param > settings chain (provider-aware or SDK-default)
    // When explicitProviderId === null (force SDK Default), skip model settings
    // to avoid picking up a provider-specific model from the settings chain.
    let modelSetting: { model: string; scope: ModelScope } | undefined;
    if (model) {
      modelSetting = { model, scope: "session" };
    } else if (explicitProviderId === null) {
      // Let SDK use its own defaults
    } else if (provider) {
      modelSetting = readProviderModelSetting(
        sessionId,
        cwd,
        provider,
        this.configStore,
        this.projectStore,
      );
    } else {
      modelSetting = readModelSetting(sessionId, cwd);
    }

    log(
      "createSession: resolved model=%s scope=%s providerId=%s",
      modelSetting?.model ?? "(default)",
      modelSetting?.scope ?? "(none)",
      provider?.id ?? "(none)",
    );

    const initResult = await this.initSessionWithTimeout(sessionId, cwd, {
      model: modelSetting?.model,
      provider,
    });
    return {
      ...initResult,
      sessionId,
      currentModel: modelSetting?.model,
      modelScope: modelSetting?.scope,
      providerId: provider?.id,
    };
  }

  /** Resume an existing session, returning converted historical messages. */
  async loadSession(
    sessionId: string,
    cwd: string,
  ): Promise<{
    sessionId: string;
    capabilities: Awaited<ReturnType<Query["initializationResult"]>>;
    messages: ClaudeCodeUIMessage[];
    currentModel?: string;
    modelScope?: ModelScope;
    providerId?: string;
  }> {
    // Resolve provider
    const providerSetting = readProviderSetting(
      sessionId,
      cwd,
      this.configStore,
      this.projectStore,
    );
    const provider = providerSetting?.provider;

    if (provider) {
      log("loadSession: resolved provider=%s scope=%s", provider.name, providerSetting!.scope);
    }

    // Read persisted model setting before initializing SDK query
    const modelSetting = provider
      ? readProviderModelSetting(sessionId, cwd, provider, this.configStore, this.projectStore)
      : readModelSetting(sessionId, cwd);

    const capabilities = await this.initSessionWithTimeout(sessionId, cwd, {
      model: modelSetting?.model,
      resume: sessionId,
      provider,
    });

    const { getSessionMessages } = await import("@anthropic-ai/claude-agent-sdk");
    const sessionMessages = await getSessionMessages(sessionId);
    const messages = await sessionMessagesToUIMessages(sessionMessages);

    log(
      "loadSession: sessionId=%s raw=%d messages=%d currentModel=%s modelScope=%s providerId=%s",
      sessionId,
      sessionMessages.length,
      messages.length,
      modelSetting?.model ?? "(default)",
      modelSetting?.scope ?? "(none)",
      provider?.id ?? "(none)",
    );

    return {
      sessionId,
      capabilities,
      messages,
      currentModel: modelSetting?.model,
      modelScope: modelSetting?.scope,
      providerId: provider?.id,
    };
  }

  /** Shared session initialization: shell env, query, canUseTool wiring. */
  private async initSession(
    sessionId: string,
    cwd: string,
    opts?: { model?: string; resume?: string; provider?: Provider },
  ): Promise<Awaited<ReturnType<Query["initializationResult"]>>> {
    const input = new Pushable<SDKUserMessage>();
    const pendingRequests = new Map<
      string,
      {
        resolve: (result: import("@anthropic-ai/claude-agent-sdk").PermissionResult) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >();

    const shellEnv = await shellEnvService.getEnv();
    const bunPath = resolveBunPath();
    const bunDir = bunPath !== "bun" ? path.dirname(bunPath) : undefined;
    const rtkPath = resolveRtkPath();
    const rtkDir = rtkPath !== "rtk" ? path.dirname(rtkPath) : undefined;
    const mergedPath = [rtkDir, bunDir, shellEnv.PATH].filter(Boolean).join(":");
    const env: Record<string, string | undefined> = {
      ...shellEnv,
      PATH: mergedPath,
    };

    const provider = opts?.provider;

    // Build settings.env for provider credentials (flag settings layer = highest priority)
    let settingsEnv: Record<string, string> | undefined;
    if (provider) {
      // Remove ANTHROPIC_API_KEY from process env to avoid conflicts
      delete env.ANTHROPIC_API_KEY;

      const fallback = provider.modelMap.model ?? Object.keys(provider.models)[0];
      settingsEnv = {
        ANTHROPIC_AUTH_TOKEN: provider.apiKey,
        ANTHROPIC_BASE_URL: provider.baseURL,
        ANTHROPIC_MODEL: opts?.model ?? fallback,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: provider.modelMap.haiku ?? fallback,
        ANTHROPIC_DEFAULT_OPUS_MODEL: provider.modelMap.opus ?? fallback,
        ANTHROPIC_DEFAULT_SONNET_MODEL: provider.modelMap.sonnet ?? fallback,
      };

      const appliedOverrides: string[] = [];
      for (const [key, value] of Object.entries(provider.envOverrides)) {
        if (ENV_BLOCKLIST.has(key)) {
          log("initSession: skipped blocked envOverride key=%s", key);
          continue;
        }
        if (value === "") {
          delete env[key];
          appliedOverrides.push(`-${key}`);
        } else {
          settingsEnv[key] = value;
          appliedOverrides.push(key);
        }
      }

      log(
        "initSession: provider=%s baseURL=%s model=%s haiku=%s opus=%s sonnet=%s envOverrides=%o",
        provider.name,
        provider.baseURL,
        settingsEnv.ANTHROPIC_MODEL,
        settingsEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL,
        settingsEnv.ANTHROPIC_DEFAULT_OPUS_MODEL,
        settingsEnv.ANTHROPIC_DEFAULT_SONNET_MODEL,
        appliedOverrides,
      );
    }

    const agentLanguage = this.configStore.get("agentLanguage");

    // RTK token optimization hook
    const tokenOptimization = this.configStore.get("tokenOptimization") !== false;
    const hasFileBasedRtkHook = detectRtkHookInSettings();
    const registerRtkHook = tokenOptimization && !hasFileBasedRtkHook;

    if (!tokenOptimization) {
      rtkLog("hook skipped (disabled)");
    } else if (hasFileBasedRtkHook) {
      rtkLog("hook skipped (file-based hook detected in ~/.claude/settings.json)");
    } else {
      rtkLog("hook registered rtkPath=%s", rtkPath);
    }

    type HookCallback = import("@anthropic-ai/claude-agent-sdk").HookCallback;
    const rtkHook: HookCallback = async (input) => {
      if (input.hook_event_name !== "PreToolUse") return { continue: true };
      const cmd = (input.tool_input as Record<string, unknown>)?.command;
      if (typeof cmd !== "string" || !cmd) return { continue: true };

      // Fast skip: commands RTK never rewrites
      if (cmd.startsWith("rtk ") || cmd.includes("<<")) {
        return { continue: true };
      }

      try {
        const { stdout } = await execFileAsync(rtkPath, ["rewrite", cmd], {
          timeout: 5000,
          env: env as Record<string, string>,
        });
        const rewritten = stdout.trim();

        if (!rewritten || rewritten === cmd) {
          rtkLog("no rewrite: %s", cmd);
          return { continue: true };
        }

        rtkLog("rewrite: %s -> %s", cmd, rewritten);
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse" as const,
            permissionDecision: "allow" as const,
            updatedInput: { command: rewritten },
          },
        };
      } catch (err: any) {
        if (err?.code === 1 || err?.status === 1) {
          // Normal: rtk rewrite exits 1 when no rewrite applies
          rtkLog("no rewrite: %s", cmd);
        } else {
          rtkLog("fallback (error): %s — %s", cmd, err?.message ?? err);
        }
        return { continue: true };
      }
    };

    // Network inspector: conditionally inject fetch interceptor via --preload
    const networkInspector = this.configStore.get("networkInspector") === true;
    if (networkInspector) {
      this.requestTracker.markInspectorEnabled(sessionId);
    }

    const queryOpts = this.queryOptions({
      sessionId,
      cwd,
      model: opts?.model,
    });
    const options: Options = {
      ...queryOpts,
      env,
      settings: {
        ...(settingsEnv ? { env: settingsEnv } : {}),
        ...(agentLanguage !== "English" ? { language: agentLanguage.toLowerCase() } : {}),
      },
      ...(registerRtkHook
        ? { hooks: { PreToolUse: [{ matcher: "Bash", hooks: [rtkHook] }] } }
        : {}),
      ...(opts?.resume ? { resume: opts.resume, sessionId: undefined } : {}),
      ...(networkInspector
        ? {
            spawnClaudeCodeProcess: (
              spawnOpts: import("@anthropic-ai/claude-agent-sdk").SpawnOptions,
            ) => {
              const interceptorPath = resolveInterceptorPath();
              log(
                "spawnClaudeCodeProcess: interceptor=%s sessionId=%s",
                interceptorPath,
                sessionId,
              );

              const child = spawn(
                spawnOpts.command,
                ["--preload", interceptorPath, ...spawnOpts.args],
                {
                  cwd: spawnOpts.cwd,
                  env: {
                    ...spawnOpts.env,
                    NV_SESSION_ID: sessionId,
                    ...(settingsEnv?.ANTHROPIC_BASE_URL
                      ? { ANTHROPIC_BASE_URL: settingsEnv.ANTHROPIC_BASE_URL }
                      : {}),
                  },
                  signal: spawnOpts.signal,
                  stdio: ["pipe", "pipe", "pipe", "pipe"],
                },
              );

              // Read interceptor data from fd 3 (dedicated IPC pipe)
              let interceptorReady = false;
              const ipcStream = child.stdio[3];
              if (ipcStream && "on" in ipcStream) {
                const rl = createInterface({ input: ipcStream as NodeJS.ReadableStream });
                rl.on("line", (line: string) => {
                  if (line === "__NV_READY") {
                    interceptorReady = true;
                    log("interceptor ready: sessionId=%s", sessionId);
                    return;
                  }
                  if (!line.startsWith("__NV_REQ:")) {
                    log("interceptor fd3 unknown line: %s", line.slice(0, 100));
                    return;
                  }
                  try {
                    const msg = JSON.parse(line.slice("__NV_REQ:".length));
                    this.requestTracker.onMessage(sessionId, msg);
                  } catch (err) {
                    log(
                      "interceptor fd3 parse error: %s line=%s",
                      err instanceof Error ? err.message : err,
                      line.slice(0, 200),
                    );
                  }
                });
              }

              setTimeout(() => {
                if (!interceptorReady) {
                  log("WARNING: network interceptor did not initialize — sessionId=%s", sessionId);
                  this.requestTracker.markInspectorFailed(sessionId);
                }
              }, 5000);

              return child;
            },
          }
        : {}),
    };

    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const q = query({ prompt: input, options });
    this.sessions.set(sessionId, {
      input,
      query: q,
      cwd,
      providerId: provider?.id,
      pendingRequests,
    });
    return q.initializationResult();
  }

  /** Wrap initSession with a timeout to prevent hanging sessions. */
  private async initSessionWithTimeout(
    sessionId: string,
    cwd: string,
    opts?: { model?: string; resume?: string; provider?: Provider },
  ): Promise<Awaited<ReturnType<Query["initializationResult"]>>> {
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Session initialization timed out")),
        INIT_TIMEOUT_MS,
      );
    });

    try {
      const result = await Promise.race([this.initSession(sessionId, cwd, opts), timeoutPromise]);
      clearTimeout(timer!);
      return result;
    } catch (err) {
      clearTimeout(timer!);
      await this.closeSession(sessionId);
      throw err;
    }
  }

  async listSessions(cwd?: string): Promise<SessionInfo[]> {
    const t0 = performance.now();

    const { listSessions: sdkListSessions } = await import("@anthropic-ai/claude-agent-sdk");
    const sessions: SDKSessionInfo[] = await sdkListSessions(cwd ? { dir: cwd } : undefined);

    // Build sessionId -> file birthtime map for accurate createdAt
    const sessionFiles = listSessionFiles();
    const birthtimeMap = new Map<string, Date>();
    for (const file of sessionFiles) {
      const id = path.basename(file, ".jsonl");
      try {
        birthtimeMap.set(id, statSync(file).birthtime);
      } catch {
        // ignore stat errors
      }
    }

    const result: SessionInfo[] = sessions.map((s) => ({
      sessionId: s.sessionId,
      title: s.customTitle ?? s.summary ?? s.firstPrompt?.slice(0, 50),
      cwd: s.cwd,
      updatedAt: new Date(s.lastModified).toISOString(),
      createdAt: (birthtimeMap.get(s.sessionId) ?? new Date(s.lastModified)).toISOString(),
    }));

    log("listSessions: DONE in %dms count=%d", Math.round(performance.now() - t0), result.length);
    return result;
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    log("renameSession: sessionId=%s title=%s", sessionId, title);
    const matches = listSessionFiles(`${sessionId}.jsonl`);
    if (matches.length === 0) {
      throw new Error(`Session file not found: ${sessionId}`);
    }
    const entry = JSON.stringify({ type: "custom-title", customTitle: title, sessionId });
    await appendFile(matches[0], entry + "\n");
    log("renameSession: DONE sessionId=%s", sessionId);
  }

  getSessionCwd(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    return session.cwd;
  }

  getSessionProviderId(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.providerId;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      log("closeSession: no-op, unknown sessionId=%s", sessionId);
      return;
    }
    session.query.close();
    for (const [requestId, pending] of session.pendingRequests) {
      clearTimeout(pending.timer);
      pending.resolve({ behavior: "deny", message: "Session closed" });
      this.eventPublisher.publish(sessionId, { kind: "request_settled", requestId });
    }
    this.sessions.delete(sessionId);
    this.requestTracker.clearSession(sessionId);
    log("closeSession: closed sessionId=%s remainingSessions=%d", sessionId, this.sessions.size);
  }

  async closeAll(): Promise<void> {
    log("closeAll: START sessions=%d", this.sessions.size);
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId);
    }
    log("closeAll: DONE");
  }

  /** Get the list of files changed in the last agent turn. */
  async lastTurnFiles(sessionId: string): Promise<RewindFilesResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    if (!session.lastUserMessageId) {
      return { canRewind: false, error: "No turns completed yet" };
    }
    try {
      return await session.query.rewindFiles(session.lastUserMessageId, { dryRun: true });
    } catch (error) {
      return {
        canRewind: false,
        error: error instanceof Error ? error.message : "Failed to get last turn files",
      };
    }
  }

  /** Get the diff for a single file changed in the last agent turn. */
  async lastTurnDiff(
    sessionId: string,
    file: string,
  ): Promise<{
    success: boolean;
    data?: { oldContent: string; newContent: string };
    error?: string;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);

    const ref = session.preTurnRef;
    if (!ref) {
      return { success: false, error: "No pre-turn snapshot available" };
    }

    try {
      // Old content: from the pre-turn snapshot
      let oldContent = "";
      try {
        const { stdout } = await execFileAsync("git", ["show", `${ref}:${file}`], {
          cwd: session.cwd,
          maxBuffer: 10 * 1024 * 1024,
        });
        oldContent = stdout;
      } catch {
        // file didn't exist before this turn
      }

      // New content: current file on disk
      let newContent = "";
      try {
        const fs = await import("node:fs/promises");
        const filePath = path.resolve(session.cwd, file);
        newContent = await fs.readFile(filePath, "utf8");
      } catch {
        // file was deleted during this turn
      }

      return { success: true, data: { oldContent, newContent } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get diff",
      };
    }
  }

  /**
   * Stream a user message as UIMessageChunks.
   * Events from the SDK are routed to the event publisher.
   */
  async *stream(
    sessionId: string,
    message: import("../../../shared/claude-code/types").ClaudeCodeUIMessage,
  ): AsyncGenerator<import("../../../shared/claude-code/types").ClaudeCodeUIMessageChunk> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    const transformer = new SDKMessageTransformer();

    // UIMessage -> SDKUserMessage: extract text + image parts
    const text = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");

    const imageBlocks = message.parts
      .filter(
        (p): p is { type: "file"; mediaType: string; url: string } =>
          p.type === "file" &&
          typeof (p as any).mediaType === "string" &&
          (p as any).mediaType.startsWith("image/"),
      )
      .map((p) => {
        const base64 = p.url.startsWith("data:") ? p.url.split(",")[1] : p.url;
        return {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: p.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: base64,
          },
        };
      });

    const content =
      imageBlocks.length > 0
        ? [...(text ? [{ type: "text" as const, text }] : []), ...imageBlocks]
        : text;

    // Pre-turn snapshot: capture working tree state before Claude modifies files
    let preTurnRef: string | undefined;
    try {
      const { stdout } = await execFileAsync("git", ["stash", "create"], { cwd: session.cwd });
      preTurnRef = stdout.trim() || undefined;
    } catch {
      // not a git repo or git not available — skip
    }
    // Fall back to HEAD if working tree was clean (git stash create returns empty)
    if (!preTurnRef) {
      try {
        const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: session.cwd });
        preTurnRef = stdout.trim() || undefined;
      } catch {
        // ignore
      }
    }
    session.preTurnRef = preTurnRef;

    const userMessageId = randomUUID();
    session.lastUserMessageId = userMessageId;

    this.requestTracker.startTurn(sessionId);
    session.input.push({
      type: "user",
      message: { role: "user", content },
      parent_tool_use_id: null,
      session_id: sessionId,
      uuid: userMessageId,
    });

    // Track the latest top-level message_start usage to compute context window fill
    let lastInputTokens = 0;

    while (true) {
      const { value, done } = await session.query.next();
      if (done || !value) break;

      // Track context window usage from top-level message_start events
      if (
        value.type === "stream_event" &&
        value.event.type === "message_start" &&
        value.parent_tool_use_id === null
      ) {
        const usage = value.event.message.usage;
        lastInputTokens =
          (usage.input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0);
      }

      // Publish to subscribe stream (result event included — carries cost/usage/stop_reason)
      const event = toUIEvent(value);
      if (event) {
        this.eventPublisher.publish(sessionId, event);
      }

      // On result, publish context_usage event with computed remaining %
      if (value.type === "result") {
        const modelEntries = Object.values(value.modelUsage ?? {});
        const contextWindowSize = modelEntries[0]?.contextWindow ?? 0;
        const remainingPct =
          contextWindowSize > 0
            ? Math.max(
                0,
                Math.min(100, Math.round((1 - lastInputTokens / contextWindowSize) * 100)),
              )
            : 0;
        this.eventPublisher.publish(sessionId, {
          kind: "event",
          event: {
            id: randomUUID(),
            type: "context_usage",
            contextWindowSize,
            usedTokens: lastInputTokens,
            remainingPct,
          },
        });
      }

      // Route to message stream (result → finish-step + finish, error → error chunk)
      for await (const chunk of transformer.transformWithAggregation(value)) {
        yield chunk;
      }

      // Break AFTER transformer so finish/finish-step chunks are sent before closing the stream
      if (value.type === "result") break;
    }
  }

  /** Handle dispatch — respond to permission request or configure session */
  handleDispatch(sessionId: string, dispatch: ClaudeCodeUIDispatch): ClaudeCodeUIDispatchResult {
    if (dispatch.kind === "respond") {
      const session = this.sessions.get(sessionId);
      if (!session) throw new Error(`Unknown session: ${sessionId}`);
      const pending = session.pendingRequests.get(dispatch.requestId);
      if (!pending) {
        log("handleDispatch: unknown requestId=%s knownIds=%o", dispatch.requestId, [
          ...session.pendingRequests.keys(),
        ]);
        return { kind: "respond", ok: false };
      }
      pending.resolve(dispatch.respond.result);
      session.pendingRequests.delete(dispatch.requestId);
      clearTimeout(pending.timer);
      return { kind: "respond", ok: true };
    }
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);

    if (dispatch.kind === "interrupt") {
      log("handleDispatch: interrupt sessionId=%s", sessionId);
      session.query.interrupt();
      return { kind: "interrupt", ok: true };
    }

    if (dispatch.kind === "configure") {
      const { configure } = dispatch;
      log("handleDispatch: configure type=%s", configure.type);
      switch (configure.type) {
        case "set_permission_mode": {
          log(
            "handleDispatch: set_permission_mode sessionId=%s mode=%s",
            sessionId,
            configure.mode,
          );
          session.query.setPermissionMode(configure.mode as SDKPermissionMode);
          return { kind: "configure", ok: true, configure };
        }
        case "set_model": {
          let model = configure.model;
          // Validate model against provider catalog
          if (session.providerId) {
            const provider = this.configStore.getProvider(session.providerId);
            if (provider && !(model in provider.models)) {
              model = provider.modelMap.model ?? Object.keys(provider.models)[0];
              log("handleDispatch: set_model fallback model=%s (not in provider catalog)", model);
            }
          }
          log("handleDispatch: set_model sessionId=%s model=%s", sessionId, model);
          session.query.setModel(model);
          return { kind: "configure", ok: true, configure: { ...configure, model } };
        }
      }
    }

    return { kind: "configure", ok: false, configure: (dispatch as any).configure };
  }
}
