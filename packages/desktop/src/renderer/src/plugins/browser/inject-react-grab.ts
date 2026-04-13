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
        console.log('BROWSER_PLUGIN:' + JSON.stringify({ active: true }));
      },
      onDeactivate: function() {
        console.log('BROWSER_PLUGIN:' + JSON.stringify({ active: false }));
      },
      onElementSelect: function(element) {
        var tagName = element.tagName ? element.tagName.toLowerCase() : '';
        var displayName = api.getDisplayName(element) || undefined;
        const id = element.id;
        const content = element.outerHTML;
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

export const INJECT_SCRIPT = `
(function() {  
  /** Part 1: React grab **/
  if (window.__REACT_GRAB__) {
    ${PLUGIN_SETUP}
  } else {
    ${reactGrabSource}
    ${PLUGIN_SETUP}
  }
})();
`;
