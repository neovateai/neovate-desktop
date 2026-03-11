/**
 * Local update server for testing auto-update.
 * Serves files from release/ directory on port 8080.
 *
 * Usage: bun run scripts/dev-app-update-server.ts
 * Usage (throttled by speed):   THROTTLE_KBPS=500 bun run scripts/dev-app-update-server.ts
 * Usage (throttled by duration): THROTTLE_SECONDS=10 bun run scripts/dev-app-update-server.ts
 */

const PORT = 8080;
const RELEASE_DIR = new URL("../release", import.meta.url).pathname;
const THROTTLE_KBPS = process.env.THROTTLE_KBPS ? parseInt(process.env.THROTTLE_KBPS) : 0;
const THROTTLE_SECONDS = process.env.THROTTLE_SECONDS ? parseInt(process.env.THROTTLE_SECONDS) : 0;

async function* throttle(
  stream: ReadableStream<Uint8Array>,
  kbps: number,
): AsyncGenerator<Uint8Array> {
  const chunkSize = 16 * 1024; // 16KB chunks
  const delayMs = (chunkSize / (kbps * 1024)) * 1000;
  const reader = stream.getReader();
  let buffer = new Uint8Array(0);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer = new Uint8Array([...buffer, ...value]);
    while (buffer.length >= chunkSize) {
      yield buffer.slice(0, chunkSize);
      buffer = buffer.slice(chunkSize);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  if (buffer.length > 0) yield buffer;
}

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
        const html = `<html><body><h1>release/</h1><ul>${files.map((f) => `<li><a href="/${f}">${f}</a></li>`).join("")}</ul></body></html>`;
        return new Response(html, {
          headers: { "Content-Type": "text/html" },
        });
      } catch {
        return new Response("release/ not found", { status: 404 });
      }
    }

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }

    const effectiveKbps =
      THROTTLE_SECONDS > 0 ? Math.ceil(file.size / THROTTLE_SECONDS / 1024) : THROTTLE_KBPS;

    if (effectiveKbps > 0 && path.endsWith(".zip")) {
      const stream = file.stream();
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          for await (const chunk of throttle(stream, effectiveKbps)) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });
      return new Response(body, {
        headers: { "Content-Type": "application/zip", "Content-Length": String(file.size) },
      });
    }

    return new Response(file);
  },
});

console.log(`Update server running at http://localhost:${server.port}`);
console.log(`Serving files from: ${RELEASE_DIR}`);
if (THROTTLE_SECONDS > 0) console.log(`Throttling zip downloads to ~${THROTTLE_SECONDS}s per file`);
else if (THROTTLE_KBPS > 0) console.log(`Throttling zip downloads to ${THROTTLE_KBPS} KB/s`);
