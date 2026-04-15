import reactGrabSource from "react-grab/dist/index.global.js?raw";

// Plugin setup runs synchronously after react-grab initializes.
// Since the source is inlined via ?raw, there's no CDN latency —
// __REACT_GRAB__ is available immediately after eval.
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
        console.log('BROWSER_PLUGIN:' + JSON.stringify({ type: 'activate' }));
      },
      onDeactivate: function() {
        console.log('BROWSER_PLUGIN:' + JSON.stringify({ type: 'deactivate' }));
      },
      onElementSelect: function(element) {
        var tagName = element.tagName ? element.tagName.toLowerCase() : '';
        var displayName = api.getDisplayName(element) || undefined;
        const id = element.id;
        const content = element.outerHTML.slice(0, 500);
        api.getSource(element).then(function(source) {
          console.log('BROWSER_PLUGIN:' + JSON.stringify({
            type: 'select',
            id,
            tagName: tagName,
            content,
            componentName: displayName,
            filePath: source ? source.filePath : undefined,
            lineNumber: source ? source.lineNumber : undefined
          }));
        });
      },
      onCopySuccess: function(elements, content) {
        console.log('BROWSER_PLUGIN:' + JSON.stringify({
          type: 'copy',
          content: content,
          elementCount: elements.length
        }));
      }
    }
  });

  api.registerPlugin({
    name: "browser-plugin-theme",
    theme: { toolbar: { enabled: false } }
  });
})();
`;

const REACT_GRAB_PRECHECK = `
function activateReactGrab() {
  if (!window?.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    return;
  }
  const MAX_NODES = 200;
  function hasReactFiberInPage(limit = 200) {
    const nodes = Array.from(document.querySelectorAll('*')).slice(0, limit);
    for (const node of nodes) {
      const keys = Object.keys(node);
      const hasFiber = keys.some(
        key =>
          key.startsWith('__reactFiber$') ||
          key.startsWith('__reactInternalInstance$')
      );
      if (hasFiber) return true;
    }
    return false;
  }
  if (!hasReactFiberInPage(MAX_NODES)) {
    return;
  }
  // event: can be inspect;
  console.log('BROWSER_PLUGIN:' + JSON.stringify({
    type: 'inspectable',
  }));
  if (window.__REACT_GRAB__) {
    ${PLUGIN_SETUP}
  } else {
    ${reactGrabSource}
    ${PLUGIN_SETUP}
  }
};
activateReactGrab();
`.trim();

export const INJECT_SCRIPT = `
(function() {  
  /** Part 1: React grab **/
  ${REACT_GRAB_PRECHECK}
})();
`;
