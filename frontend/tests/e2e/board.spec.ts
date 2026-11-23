import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./signed-in";

function lane(page: Page, name: string) {
  return page.getByRole("region", { name: name + " column", exact: true });
}

async function pickUp(page: Page, cardTitle: Locator) {
  await cardTitle.hover();
  const box = (await cardTitle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.down();
  await page.mouse.move(x + 10, y, { steps: 4 });
  await expect(page.locator("article[data-dragging]").first()).toBeVisible();
}

async function dragOver(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 48, { steps: 12 });
  await expect(target).toHaveAttribute("data-drop-target", "true");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Move Audit existing content" })).toHaveAttribute("aria-describedby", /.+/);
});

test("creates, moves, and deletes a card on a renamed board, then restores the seed on reload", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Website launch" })).toBeVisible();
  await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(5);
  await expect(page.getByRole("article")).toHaveCount(12);

  await lane(page, "Ready").getByRole("button", { name: "Rename Ready column" }).click();
  await page.getByRole("textbox", { name: "Column name" }).fill("Queued");
  await page.getByRole("textbox", { name: "Column name" }).press("Enter");
  const source = lane(page, "Backlog");
  const target = lane(page, "Queued");
  await source.getByRole("button", { name: "Add card" }).click();
  const form = source.getByRole("form");
  await form.getByLabel("Title", { exact: true }).fill("Check launch links");
  await form.getByLabel(/Details/).fill("Verify the footer links on mobile.");
  await form.getByRole("button", { name: "Add card" }).click();

  await pickUp(page, source.getByRole("heading", { name: "Check launch links" }));
  await dragOver(page, target);
  await page.mouse.up();
  const moved = target.getByRole("article", { name: "Check launch links" });
  await expect(moved).toContainText("Verify the footer links on mobile.");
  await expect(target.getByRole("article").first()).toHaveAccessibleName("Check launch links");
  await expect(source.getByRole("article")).toHaveCount(3);
  await moved.hover();
  await moved.getByRole("button", { name: "Delete Check launch links" }).click();
  await expect(page.getByRole("article")).toHaveCount(12);
  await expect(moved).toHaveCount(0);
  await source.getByRole("article").first().hover();
  await source.getByRole("button", { name: "Delete Audit existing content" }).click();
  await page.reload();
  await expect(lane(page, "Ready")).toBeVisible();
  await expect(source.getByRole("heading", { name: "Audit existing content" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(12);
});

test("moves by keyboard into an empty column and returns focus to the moved card", async ({ page }) => {
  const source = lane(page, "Backlog");
  const target = lane(page, "Ready");
  for (const title of ["Write homepage copy", "Prepare project imagery"]) {
    await target.getByRole("article", { name: title }).hover();
    await target.getByRole("button", { name: "Delete " + title }).click();
  }
  await expect(target.getByRole("article")).toHaveCount(0);
  const move = source.getByRole("button", { name: "Move Audit existing content" });
  await move.focus();
  await page.keyboard.press("Space");
  await expect(source).toHaveAttribute("data-drop-target", "true");
  await page.keyboard.press("ArrowRight");
  await expect(target).toHaveAttribute("data-drop-target", "true");
  await page.keyboard.press("Space");
  await expect(target.getByRole("heading", { name: "Audit existing content" })).toBeVisible();
  await expect(target.getByRole("button", { name: "Move Audit existing content" })).toBeFocused();
  await expect(source.getByRole("article")).toHaveCount(2);
});

test("preserves order for same-column, cancelled, and outside drops", async ({ page }) => {
  const source = lane(page, "Backlog");
  const target = lane(page, "Ready");
  const title = source.getByRole("heading", { name: "Audit existing content" });
  const original = ["Audit existing content", "Explore art direction", "Outline the journal"];

  await pickUp(page, title);
  await dragOver(page, source);
  await page.mouse.up();
  await expect(source.getByRole("heading", { level: 4 })).toHaveText(original);

  await pickUp(page, title);
  await dragOver(page, target);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(source.getByRole("heading", { level: 4 })).toHaveText(original);

  await pickUp(page, title);
  const outside = (await target.boundingBox())!;
  await page.mouse.move(outside.x + outside.width / 2, outside.y - 6, { steps: 12 });
  await expect(page.locator("[data-drop-target]")).toHaveCount(0);
  await page.mouse.up();
  await expect(source.getByRole("heading", { level: 4 })).toHaveText(original);
  await expect(target.getByRole("article")).toHaveCount(2);
});

test("handles blank names, cancelled drafts, blur commits, and title-only cards", async ({ page }) => {
  const review = lane(page, "Review");
  await review.getByRole("button", { name: "Rename Review column" }).click();
  const name = page.getByRole("textbox", { name: "Column name" });
  await name.fill("  ");
  await name.press("Enter");
  await expect(review.getByRole("button", { name: "Rename Review column" })).toBeFocused();
  await review.getByRole("button", { name: "Rename Review column" }).click();
  await name.fill("Design QA");
  await page.getByRole("heading", { name: "Board view" }).click();

  const renamed = lane(page, "Design QA");
  const add = renamed.getByRole("button", { name: "Add card" });
  await add.click();
  await renamed.getByLabel("Title", { exact: true }).fill("   ");
  await expect(renamed.getByRole("form").getByRole("button", { name: "Add card" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(add).toBeFocused();
  await add.click();
  await renamed.getByLabel("Title", { exact: true }).fill("Release checklist");
  await renamed.getByLabel("Title", { exact: true }).press("Enter");
  await expect(renamed.getByRole("article", { name: "Release checklist" })).toBeVisible();
  await expect(add).toBeFocused();
  await page.reload();
  await expect(page.getByRole("article", { name: "Release checklist" })).toHaveCount(0);
});

test("moves one column per arrow across a narrow, horizontally scrolling board", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await lane(page, "Backlog").getByRole("button", { name: "Move Audit existing content" }).focus();
  await page.keyboard.press("Space");
  await expect(lane(page, "Backlog")).toHaveAttribute("data-drop-target", "true");
  for (const name of ["Ready", "In progress", "Review", "Done"]) {
    await page.keyboard.press("ArrowRight");
    await expect(lane(page, name)).toHaveAttribute("data-drop-target", "true");
  }
  await page.keyboard.press("ArrowRight");
  await expect(lane(page, "Done")).toHaveAttribute("data-drop-target", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(lane(page, "Review")).toHaveAttribute("data-drop-target", "true");
  await page.keyboard.press("Space");
  await expect(lane(page, "Review").getByRole("button", { name: "Move Audit existing content" })).toBeFocused();
});

test("reorders cards in both directions with the mouse and keyboard", async ({ page }) => {
  const source = lane(page, "Backlog");
  const titles = source.getByRole("heading", { level: 4 });
  const first = "Audit existing content";
  const second = "Explore art direction";
  const third = "Outline the journal";
  for (const [targetName, fraction, expected] of [
    [third, 0.8, [second, third, first]],
    [second, 0.2, [first, second, third]],
  ] as const) {
    await pickUp(page, source.getByRole("heading", { name: first }));
    const box = (await source.getByRole("article", { name: targetName }).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * fraction, { steps: 12 });
    await expect(source).toHaveAttribute("data-drop-target", "true");
    await page.mouse.up();
    await expect(titles).toHaveText([...expected]);
    await expect(page.locator("[data-drop-target], [data-dragging], [data-dropping]")).toHaveCount(0);
  }

  const handle = source.getByRole("button", { name: "Move " + second });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(source).toHaveAttribute("data-drop-target", "true");
  await page.keyboard.press("ArrowUp");
  await expect(source.locator("[data-insert-before]")).toHaveAttribute("data-card-id", "content-audit");
  await page.keyboard.press("Space");
  await expect(titles).toHaveText([second, first, third]);
  await expect(page.locator("[data-drop-target], [data-dragging], [data-dropping]")).toHaveCount(0);
  await expect(handle).toBeFocused();
  await page.keyboard.press("Space");
  await expect(source).toHaveAttribute("data-drop-target", "true");
  await page.keyboard.press("ArrowDown");
  await expect(source.locator("[data-insert-before]")).toHaveAttribute("data-card-id", "journal");
  await page.keyboard.press("Escape");
  await expect(titles).toHaveText([second, first, third]);
});
