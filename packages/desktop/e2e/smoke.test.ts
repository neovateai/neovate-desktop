import { test, expect } from "./fixtures/electron";
import { APP_ROOT, APP_TITLE } from "./selectors/app";

test("window opens and app shell renders", async ({ window }) => {
  await expect(window.locator(APP_ROOT)).toBeVisible();
  await expect(window.locator(APP_TITLE)).toHaveText("Neovate Desktop");
});

test("window has correct initial dimensions", async ({ electronApp }) => {
  // Ensure window is available first
  await electronApp.firstWindow();
  const [width, height] = await electronApp.evaluate(async (electron) => {
    const win = electron.BrowserWindow.getAllWindows()[0];
    return win.getSize();
  });
  expect(width).toBe(1200);
  expect(height).toBe(800);
});

test("Electron main process is accessible", async ({ electronApp }) => {
  const appPath = await electronApp.evaluate(async ({ app }) => {
    return app.getAppPath();
  });
  expect(appPath).toBeTruthy();
});
