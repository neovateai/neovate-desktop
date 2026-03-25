import "./core/logger";
import "./assets/main.css";
import { RendererApp } from "./core";
import browserPlugin from "./plugins/browser";

const app = new RendererApp({
  plugins: [browserPlugin({ includeHosts: ["localhost", "127.0.0.1"] })],
});
app.start();
