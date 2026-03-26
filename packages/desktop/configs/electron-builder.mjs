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

  // Map electron-builder platform name to Node.js process.platform values
  const platformNameMap = { mac: "darwin", linux: "linux", windows: "win32" };
  const platform =
    platformNameMap[context.packager.platform.name] || context.packager.platform.name;
  const isWin = platform === "win32";
  const binExt = isWin ? ".exe" : "";

  const bunBin = path.join(projectDir, "vendor", "bun", `bun${binExt}`);
  if (!existsSync(bunBin)) {
    console.log(`  • downloading bun for ${platform}/${arch}...`);
    execSync(`bun scripts/download-bun.ts --platform ${platform} --arch ${arch}`, {
      cwd: projectDir,
      stdio: "inherit",
    });
  }

  const rtkBin = path.join(projectDir, "vendor", "rtk", `rtk${binExt}`);
  if (!existsSync(rtkBin)) {
    console.log(`  • downloading rtk for ${platform}/${arch}...`);
    execSync(`bun scripts/download-rtk.ts --platform ${platform} --arch ${arch}`, {
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
    { from: "vendor/bun", to: "bun", filter: ["bun", "bun.exe"] },
    { from: "vendor/rtk", to: "rtk", filter: ["rtk", "rtk.exe"] },
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
  ],

  protocols: [{ name: "Neovate", schemes: [isDev ? "neovate-dev" : "neovate"] }],

  compression: isDev ? "normal" : "maximum",

  mac: {
    icon: isDev ? "build/icons/dev/icon.icns" : "build/icons/prod/icon.icns",
    category: "public.app-category.developer-tools",
    hardenedRuntime: true,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    target: ["dmg", "zip"],
    notarize: !!(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD),
    files: [
      "!**/node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/*-linux/**",
      "!**/node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/*-win32/**",
      "!**/node_modules/node-pty/prebuilds/win32-*/**",
      "!**/node_modules/node-pty/prebuilds/linux-*/**",
    ],
  },

  win: {
    icon: isDev ? "build/icons/dev/icon.png" : "build/icons/prod/icon.png",
    target: [{ target: "nsis", arch: ["x64"] }],
    files: [
      "!**/node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/*-linux/**",
      "!**/node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/*-darwin/**",
      "!**/node_modules/node-pty/prebuilds/darwin-*/**",
      "!**/node_modules/node-pty/prebuilds/linux-*/**",
    ],
  },

  linux: {
    icon: isDev ? "build/icons/dev" : "build/icons/prod",
    category: "Development",
    target: [{ target: "AppImage", arch: ["x64"] }],
    files: [
      "!**/node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/*-darwin/**",
      "!**/node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/*-win32/**",
      "!**/node_modules/node-pty/prebuilds/darwin-*/**",
      "!**/node_modules/node-pty/prebuilds/win32-*/**",
    ],
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },

  npmRebuild: false,

  electronLanguages: ["en", "en-US", "en-GB"],
};

export default config;
