import { test as base, type ElectronApplication, type Page, _electron } from "@playwright/test";

interface ElectronFixtures {
  electronApp: ElectronApplication;
  window: Page;
}

export const test = base.extend<ElectronFixtures>({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    const app = await _electron.launch({
      args: ["dist/main/index.js"],
    });
    await use(app);
    await app.close();
  },
  window: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await use(page);
  },
});

export { expect } from "@playwright/test";
