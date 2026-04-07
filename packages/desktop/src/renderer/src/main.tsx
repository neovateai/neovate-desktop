import "./core/logger";
import "./assets/main.css";
import { RendererApp } from "./core";
import browserPlugin from "./plugins/browser";

const app = new RendererApp({
  plugins: [browserPlugin()],
});
const started = app.start();

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    await started;
    await app.stop();
  });
}
