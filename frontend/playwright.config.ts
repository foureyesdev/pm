import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 2,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3100",
    url: baseURL,
    reuseExistingServer: false,
  },
  projects: [
    ...(["chromium", "firefox", "webkit"] as const).map((browserName) => ({
      name: browserName,
      testMatch: "board.spec.ts",
      use: { browserName, viewport: { width: 1440, height: 960 } },
    })),
    { name: "mobile-chromium", testMatch: "mobile.spec.ts", use: { ...devices["Pixel 7"] } },
  ],
});
