const isDev = process.env.BUILD_ENV === "dev";

/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration
 */
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
    },
  ],

  asar: true,
  asarUnpack: [
    "resources/**",
    "**/node_modules/node-pty/**/*",
    "**/node_modules/@anthropic-ai/claude-agent-sdk/**/*",
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

  compression: isDev ? "store" : "maximum",

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
