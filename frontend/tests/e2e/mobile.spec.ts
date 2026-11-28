import { setTimeout as hold } from "node:timers/promises";
import { expect, type CDPSession } from "@playwright/test";
import { test } from "./signed-in";

type Point = { x: number; y: number };

async function touch(client: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", point?: Point) {
  await client.send("Input.dispatchTouchEvent", { type, touchPoints: point ? [point] : [] });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Move Audit existing content" })).toHaveAttribute("aria-describedby", /.+/);
});

test("swipes across all five columns and wraps long card text on a phone", async ({ page, context }) => {
  const client = await context.newCDPSession(page);
  const viewport = page.getByRole("region", { name: "Board columns", exact: true });
  const last = page.getByRole("region", { name: "Done column" });
  const viewportBox = (await viewport.boundingBox())!;
  const y = viewportBox.y + 22;
  for (let swipe = 0; swipe < 8; swipe++) {
    const lastBox = (await last.boundingBox())!;
    if (lastBox.x + lastBox.width <= page.viewportSize()!.width) break;
    const x = page.viewportSize()!.width - 20;
    await touch(client, "touchStart", { x, y });
    for (let step = 1; step <= 8; step++) {
      await touch(client, "touchMove", { x: x - step * (x - 24) / 8, y });
    }
    // Pause the finger before lifting so the next tap is not consumed by a fling.
    await hold(180);
    await touch(client, "touchEnd");
  }
  await expect(last).toBeInViewport({ ratio: 0.95 });
  await last.getByRole("button", { name: "Add card" }).tap();
  const form = last.getByRole("form");
  const title = "Unbroken".repeat(12);
  await form.getByLabel("Title", { exact: true }).fill(title);
  await form.getByLabel(/Details/).fill("Details".repeat(40));
  await form.getByRole("button", { name: "Add card" }).tap();
  const card = last.getByRole("article", { name: title });
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await card.getByRole("button", { name: "Delete " + title }).tap();
  await expect(card).toHaveCount(0);
});

test("moves a card by touch using the grip on a phone", async ({ page, context }) => {
  const client = await context.newCDPSession(page);
  const handle = page.getByRole("button", { name: "Move Audit existing content" });
  const target = page.getByRole("region", { name: "Ready column" });
  const grip = (await handle.boundingBox())!;
  const column = (await target.boundingBox())!;
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  const endX = Math.min(page.viewportSize()!.width - 12, column.x + 20);
  await touch(client, "touchStart", start);
  await expect(page.locator("article[data-dragging]").first()).toBeVisible();
  for (let step = 1; step <= 6; step++) {
    await touch(client, "touchMove", { x: start.x + (endX - start.x) * step / 6, y: start.y });
  }
  await expect(target).toHaveAttribute("data-drop-target", "true");
  await touch(client, "touchEnd");
  await expect(target.getByRole("article", { name: "Audit existing content" })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Backlog column" }).getByRole("article")).toHaveCount(2);
});

test("reorders cards within a column by touch", async ({ page, context }) => {
  const client = await context.newCDPSession(page);
  const backlog = page.getByRole("region", { name: "Backlog column" });
  const grip = (await backlog.getByRole("button", { name: "Move Audit existing content" }).boundingBox())!;
  const second = (await backlog.getByRole("article", { name: "Explore art direction" }).boundingBox())!;
  await touch(client, "touchStart", { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 });
  await expect(page.locator("article[data-dragging]").first()).toBeVisible();
  await touch(client, "touchMove", { x: second.x + second.width / 2, y: second.y + second.height * 0.8 });
  await expect(backlog.locator("[data-insert-before]")).toHaveAccessibleName("Outline the journal");
  await touch(client, "touchEnd");
  const reordered = ["Explore art direction", "Audit existing content", "Outline the journal"];
  await expect(backlog.getByRole("heading", { level: 4 })).toHaveText(reordered);
  await expect(page.getByRole("region", { name: "Board view" })).toHaveAttribute("aria-busy", "false");
  await page.reload();
  await expect(backlog.getByRole("heading", { level: 4 })).toHaveText(reordered);
});
