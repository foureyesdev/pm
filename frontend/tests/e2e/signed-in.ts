import { expect, test as base } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, runTest) => {
    const session = await page.request.post("/api/session", {
      data: { username: "user", password: "password" },
    });
    await expect(session).toBeOK();
    await runTest(page);
    await page.request.delete("/api/session");
  },
});
