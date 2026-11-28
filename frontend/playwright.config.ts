import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // Every test resets the one shared `user` board, so tests run one at a time.
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:8001", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    ...(["chromium", "firefox", "webkit"] as const).map((browserName) => ({
      name: browserName,
      testMatch: ["board.spec.ts", "chat.spec.ts", "session.spec.ts"],
      use: { browserName, viewport: { width: 1440, height: 960 } },
    })),
    { name: "mobile-chromium", testMatch: ["mobile.spec.ts", "session.spec.ts"], use: { ...devices["Pixel 7"] } },
  ],
});
