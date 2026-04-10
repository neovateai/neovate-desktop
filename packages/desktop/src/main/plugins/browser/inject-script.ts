import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const reactGrabSource = readFileSync(require.resolve("react-grab/dist/index.global.js"), "utf-8");

const PLUGIN_SETUP = `
(function() {
  var api = window.__REACT_GRAB__;
  if (!api) return;

  try { api.unregisterPlugin("browser-plugin"); } catch(e) {}
  try { api.unregisterPlugin("browser-plugin-theme"); } catch(e) {}

  api.registerPlugin({
    name: "browser-plugin",
    hooks: {
      onActivate: function() {
        console.log('BROWSER_PLUGIN:' + JSON.stringify({ active: true }));
      },
      onDeactivate: function() {
        console.log('BROWSER_PLUGIN:' + JSON.stringify({ active: false }));
      }
    }
  });

  api.registerPlugin({
    name: "browser-plugin-theme",
    theme: { toolbar: { enabled: false } }
  });
})();
`;

export const INJECT_SCRIPT = `
(function() {
  if (window.__REACT_GRAB__) {
    ${PLUGIN_SETUP}
    return;
  }
  ${reactGrabSource}
  ${PLUGIN_SETUP}
})();
`;
