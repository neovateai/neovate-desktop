import type { MainPlugin } from "../../core/plugin/types";

import { PreviewManager } from "./preview-manager";
import { createLivePreviewRouter } from "./router";

/**
 * Demo: MCP Live Preview.
 *
 * Contributes an in-process MCP server with a `preview` tool.
 * When the Agent calls `preview` with HTML, the content is streamed
 * to a ContentPanel view in the renderer for real-time rendering.
 */
export default {
  name: "demo-mcp-live-preview",

  async configContributions(ctx) {
    const { createSdkMcpServer, tool } = await import("@anthropic-ai/claude-agent-sdk");
    const { z } = await import("zod");

    const previewManager = new PreviewManager();

    const server = createSdkMcpServer({
      name: "live-preview",
      version: "0.0.1",
      tools: [
        tool(
          "preview",
          "Render HTML content in the Live Preview panel. Use this to show visual previews to the user.",
          { html: z.string().describe("Complete HTML content to render") },
          async ({ html }) => {
            previewManager.setHtml(html);
            return {
              content: [{ type: "text" as const, text: "Preview updated." }],
            };
          },
        ),
      ],
    });

    return {
      router: createLivePreviewRouter(ctx.orpcServer, previewManager),
      agents: {
        claudeCode: {
          options: {
            mcpServers: {
              "live-preview": server,
            },
          },
        },
      },
    };
  },
} satisfies MainPlugin;
