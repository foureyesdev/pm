import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:8000";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 2,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: "npm start",
    url: `${baseURL}/api/health`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [
    ...(["chromium", "firefox", "webkit"] as const).map((browserName) => ({
      name: browserName,
      testMatch: ["board.spec.ts", "session.spec.ts"],
      use: { browserName, viewport: { width: 1440, height: 960 } },
    })),
    { name: "mobile-chromium", testMatch: ["mobile.spec.ts", "session.spec.ts"], use: { ...devices["Pixel 7"] } },
  ],
});
