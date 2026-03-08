/**
 * Local update server for testing auto-update.
 * Serves files from release-dev/ directory on port 8080.
 *
 * Usage: bun run scripts/dev-app-update-server.ts
 */

const PORT = 8080;
const RELEASE_DIR = new URL("../release-dev", import.meta.url).pathname;

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = `${RELEASE_DIR}${path}`;

    // Directory listing for root
    if (path === "/index.html") {
      const { readdir } = await import("node:fs/promises");
      try {
        const files = await readdir(RELEASE_DIR);
        const html = `<html><body><h1>release-dev/</h1><ul>${files.map((f) => `<li><a href="/${f}">${f}</a></li>`).join("")}</ul></body></html>`;
        return new Response(html, {
          headers: { "Content-Type": "text/html" },
        });
      } catch {
        return new Response("release-dev/ not found", { status: 404 });
      }
    }

    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Update server running at http://localhost:${server.port}`);
console.log(`Serving files from: ${RELEASE_DIR}`);
