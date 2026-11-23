import { expect, test } from "@playwright/test";

test("signs in from a fresh visit, keeps the session on reload, and logs out", async ({ page }) => {
  await page.goto("/");
  const form = page.getByRole("heading", { name: "Sign in to Fieldwork" });
  const board = page.getByRole("heading", { name: "Board view" });
  await expect(form).toBeVisible();
  await expect(board).toHaveCount(0);

  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Incorrect username or password.");
  await expect(board).toHaveCount(0);

  await page.getByLabel("Password").fill("password");
  await page.getByLabel("Password").press("Enter");
  await expect(board).toBeVisible();
  await page.reload();
  await expect(board).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(form).toBeVisible();
  await expect(board).toHaveCount(0);
  await page.reload();
  await expect(form).toBeVisible();
  await expect(board).toHaveCount(0);
});
