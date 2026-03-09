import { execSync } from "node:child_process";

const localUpdateServer = process.env.LOCAL_UPDATE_SERVER || "http://localhost:8080";
const signIdentity = process.env.LOCAL_UPDATE_SIGN_IDENTITY || "Neovate Local Code Sign";

/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration
 */
const config = {
  appId: "com.neovateai.desktop.dev",
  productName: "Neovate Dev",

  directories: {
    buildResources: "build",
    output: "release",
  },

  artifactName: "neovate-dev-${arch}.${ext}",

  publish: [{ provider: "generic", url: localUpdateServer }],

  asar: true,
  asarUnpack: ["resources/**", "**/node_modules/node-pty/**/*"],

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

  compression: "store",

  mac: {
    icon: "build/icons/dev/icon.icns",
    category: "public.app-category.developer-tools",
    hardenedRuntime: false,
    identity: null,
    notarize: false,
    target: [
      { target: "dmg", arch: ["arm64"] },
      { target: "zip", arch: ["arm64"] },
    ],
  },

  npmRebuild: false,
  electronLanguages: ["en", "en-US", "en-GB"],

  afterPack: async (context) => {
    const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
    console.log(`Codesigning with identity: ${signIdentity}`);
    execSync(`codesign --force --deep --sign "${signIdentity}" "${appPath}"`, { stdio: "inherit" });
  },
};

export default config;
