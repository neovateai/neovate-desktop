/**
 * Type declarations for the Electron <webview> tag in the renderer process.
 *
 * The renderer tsconfig does not include Electron's full type definitions,
 * so we declare the subset needed for the browser plugin.
 */

interface WebviewElement extends HTMLElement {
  src: string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  openDevTools(): void;
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
}

declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<WebviewElement> & {
        src?: string;
        preload?: string;
        partition?: string;
        allowpopups?: boolean;
      },
      WebviewElement
    >;
  }
}
