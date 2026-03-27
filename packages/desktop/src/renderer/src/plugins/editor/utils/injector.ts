export const INJECT_STYLES = `
/* modify the empty icon */
.monaco-workbench .part.editor>.content .editor-group-container>.editor-group-watermark .letterpress {
  background-image: url('https://mdn.alipayobjects.com/huamei_puljkc/afts/img/A*Wrd1TL3S_pYAAAAAQFAAAAgAenyRAQ/original')!important;
  max-width: 128px!important;
  max-height: 95px!important;
}
/* modify the empty icon: [dark theme] */
.vs-dark.monaco-workbench .part.editor>.content .editor-group-container>.editor-group-watermark .letterpress {
  background-image: url('https://mdn.alipayobjects.com/huamei_puljkc/afts/img/A*hgaTTZvoTicAAAAAQDAAAAgAenyRAQ/original')!important;
  max-width: 128px!important;
  max-height: 95px!important;
}

.monaco-workbench .part.editor>.content .editor-group-container>.editor-group-watermark>.watermark-container {
  gap: 8px!important;
}
/* hide the default shortcuts tips */
.monaco-workbench .part.editor>.content .editor-group-container>.editor-group-watermark .shortcuts .watermark-box {
  display: none!important;
}
/* add simple custom tip text */
.monaco-workbench .part.editor>.content .editor-group-container>.editor-group-watermark .shortcuts::after {
  content: "No File Opened";
  text-align: center!important;
  display: block!important;
}
`.trim();

async function injectScript(webview: HTMLWebViewElement): Promise<string> {
  const script = `
(function() {
  function updateSidebarVisibility() {
    const sidebar = document.getElementById('workbench.parts.sidebar');
    if (!sidebar) return;

    const titleLabel = sidebar.querySelector('.title-label');
    if (!titleLabel) return;

    const h2 = titleLabel.querySelector('h2');
    if (!h2) return;

    const text = h2.textContent?.trim() || '';
    if (text === 'Explorer') {
      sidebar.style.setProperty('display', 'none', 'important');
    } else {
      sidebar.style.removeProperty('display');
    }
  }

  function observeSidebar() {
    const sidebar = document.getElementById('workbench.parts.sidebar');
    if (sidebar) {
      updateSidebarVisibility();

      const observer = new MutationObserver(() => {
        updateSidebarVisibility();
      });

      observer.observe(sidebar, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true
      });
    }
  }

  // 初始化观察
  const bodyObserver = new MutationObserver(() => {
    const sidebar = document.getElementById('workbench.parts.sidebar');
    if (sidebar) {
      observeSidebar();
    }
  });
  bodyObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  // 立即尝试一次
  observeSidebar();

  // FIXME: 处理历史方案的残留 neovate.overwrite.css 的 link 标签
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  links.forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (href.includes('neovate.overwrite.css')) {
      link.remove();
    }
  });
  console.log('[Neovate] sidebar visibility observer started');
})();
  `.trim();
  return new Promise((resolve, reject) => {
    const doInject = async () => {
      try {
        // @ts-expect-error executeJavaScript 不在标准类型中
        await webview.executeJavaScript(script, false);
        resolve("");
      } catch (err) {
        reject(err);
      }
    };
    // 如果 webview 已经准备好，直接注入；否则等待 dom-ready 事件
    if (webview.isConnected) {
      doInject();
    } else {
      webview.addEventListener("dom-ready", doInject, { once: true });
    }
  });
}

async function injectCSS(webview: HTMLWebViewElement): Promise<void> {
  const css = INJECT_STYLES;
  return new Promise((resolve, reject) => {
    const doInject = async () => {
      try {
        // @ts-expect-error insertCSS 不在标准类型中
        await webview.insertCSS(css);
        resolve();
      } catch (err) {
        reject(err);
      }
    };

    if (webview.isConnected) {
      doInject();
    } else {
      webview.addEventListener("dom-ready", doInject, { once: true });
    }
  });
}

export function executeInject(webview: HTMLWebViewElement) {
  injectScript(webview);
  injectCSS(webview);
}
