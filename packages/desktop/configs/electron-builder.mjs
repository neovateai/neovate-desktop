const isDev = process.env.BUILD_ENV === "dev";

/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration
 */
/** @param {import('electron-builder').BeforePackContext} context */
async function beforePack(context) {
  const { execSync } = await import("node:child_process");
  const { existsSync } = await import("node:fs");
  const path = await import("node:path");

  const projectDir = context.packager.projectDir;

  // electron-builder Arch enum: 0=ia32, 1=x64, 2=armv7l, 3=arm64, 4=universal
  const archMap = { 1: "x64", 3: "arm64" };
  const arch = archMap[context.arch];
  if (!arch) throw new Error(`Unsupported arch: ${context.arch}`);

  const bunBin = path.join(projectDir, "vendor", "bun", "bun");
  if (!existsSync(bunBin)) {
    console.log(`  • downloading bun for ${context.packager.platform.name}/${arch}...`);
    execSync(`bun scripts/download-bun.ts --platform darwin --arch ${arch}`, {
      cwd: projectDir,
      stdio: "inherit",
    });
  }

  const rtkBin = path.join(projectDir, "vendor", "rtk", "rtk");
  if (!existsSync(rtkBin)) {
    console.log(`  • downloading rtk for ${context.packager.platform.name}/${arch}...`);
    execSync(`bun scripts/download-rtk.ts --platform darwin --arch ${arch}`, {
      cwd: projectDir,
      stdio: "inherit",
    });
  }
}

const config = {
  appId: isDev ? "com.neovateai.desktop.dev" : "com.neovateai.desktop",
  productName: isDev ? "Neovate Dev" : "Neovate",

  directories: {
    buildResources: "build",
    output: "release",
  },

  artifactName: isDev ? "neovate-dev-${arch}.${ext}" : "neovate-${version}-${arch}.${ext}",

  publish: [
    {
      provider: "github",
      owner: "neovateai",
      repo: "neovate-desktop",
      releaseType: "draft",
    },
  ],

  asar: true,
  asarUnpack: [
    "resources/**",
    "**/node_modules/node-pty/**/*",
    "**/node_modules/@anthropic-ai/claude-agent-sdk/**/*",
  ],

  beforePack,

  extraResources: [
    { from: "vendor/bun", to: "bun", filter: ["bun"] },
    { from: "vendor/rtk", to: "rtk", filter: ["rtk"] },
    { from: "resources/fetch-interceptor.js", to: "fetch-interceptor.js" },
  ],

  files: [
    "dist/**/*",
    "node_modules/**/*",
    "!**/.vscode/*",
    "!src/*",
    "!electron.vite.config.{js,ts,mjs,cjs}",
    "!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}",
    "!{.env,.env.*,.npmrc,pnpm-lock.yaml}",
    "!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}",

    // ── Unused dependencies ──
    "!**/node_modules/@img/sharp-libvips*/**",
    "!**/node_modules/framer-motion/**",

    // ── Renderer-only deps (already bundled into dist/renderer/ by Vite) ──
    "!**/node_modules/date-fns/**",
    "!**/node_modules/mermaid/**",
    "!**/node_modules/@mermaid-js/**",
    "!**/node_modules/cytoscape/**",
    "!**/node_modules/cytoscape-*/**",
    "!**/node_modules/langium/**",
    "!**/node_modules/shiki/**",
    "!**/node_modules/@shikijs/**",
    "!**/node_modules/@tiptap/**",
    "!**/node_modules/@pierre/**",
    "!**/node_modules/@streamdown/**",
    "!**/node_modules/katex/**",
    "!**/node_modules/lodash-es/**",
    "!**/node_modules/motion-dom/**",
    "!**/node_modules/d3-*/**",
    "!**/node_modules/dompurify/**",
    "!**/node_modules/chevrotain/**",
    "!**/node_modules/@chevrotain/**",

    // ── claude-agent-sdk: strip non-macOS ripgrep binaries ──
    "!**/node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/*-linux/**",

    // ── node-pty: strip non-macOS prebuilds ──
    "!**/node_modules/node-pty/prebuilds/win32-*/**",
  ],

  compression: isDev ? "normal" : "maximum",

  mac: {
    icon: isDev ? "build/icons/dev/icon.icns" : "build/icons/prod/icon.icns",
    category: "public.app-category.developer-tools",
    hardenedRuntime: true,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    target: [
      {
        target: "dmg",
        arch: ["arm64", "x64"],
      },
      {
        target: "zip",
        arch: ["arm64", "x64"],
      },
    ],
    notarize: !!(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD),
  },

  npmRebuild: false,

  electronLanguages: ["en", "en-US", "en-GB"],
};

export default config;
