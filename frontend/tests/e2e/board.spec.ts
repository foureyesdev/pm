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

// Reload once every pending save has reached the server.
async function reloadWhenSaved(page: Page) {
  await expect(page.getByRole("region", { name: "Board view" })).toHaveAttribute("aria-busy", "false");
  await page.reload();
  await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(5);
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

test("creates, moves, and deletes a card on a renamed board, then keeps the changes after reload and sign-in", async ({ page }) => {
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
  await reloadWhenSaved(page);
  const saved = async () => {
    await expect(lane(page, "Ready")).toHaveCount(0);
    await expect(target.getByRole("heading", { level: 4 })).toHaveText(["Write homepage copy", "Prepare project imagery"]);
    await expect(source.getByRole("heading", { level: 4 })).toHaveText(["Explore art direction", "Outline the journal"]);
    await expect(page.getByRole("article")).toHaveCount(11);
  };
  await saved();

  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await saved();
});

test("edits a card in place, validates the title, and keeps the edit after reload", async ({ page }) => {
  const ready = lane(page, "Ready");
  const card = ready.getByRole("article", { name: "Write homepage copy" });
  const edit = card.getByRole("button", { name: "Edit Write homepage copy" });
  await card.hover();
  await edit.click();
  const form = ready.getByRole("form", { name: "Edit Write homepage copy" });
  const title = form.getByLabel("Title", { exact: true });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue("Write homepage copy");
  await title.fill("Discarded title");
  await page.keyboard.press("Escape");
  await expect(edit).toBeFocused();
  await expect(card).toContainText("Draft the opening headline");

  await edit.click();
  await title.fill("   ");
  await expect(form.getByRole("button", { name: "Save" })).toBeDisabled();
  await title.fill("Write launch copy");
  await form.getByLabel(/Details/).fill("Headline, intro, and footer.");
  await form.getByRole("button", { name: "Save" }).click();
  const edited = ready.getByRole("article", { name: "Write launch copy" });
  await expect(edited).toContainText("Headline, intro, and footer.");
  await expect(edited.getByRole("button", { name: "Edit Write launch copy" })).toBeFocused();

  await reloadWhenSaved(page);
  await expect(ready.getByRole("heading", { level: 4 })).toHaveText(["Write launch copy", "Prepare project imagery"]);
  await expect(edited).toContainText("Headline, intro, and footer.");
  await expect(edited).not.toContainText("Draft the opening headline");
});

test("restores the saved order and reports the error when a move cannot be saved", async ({ page }) => {
  const source = lane(page, "Backlog");
  const target = lane(page, "Ready");
  const original = ["Audit existing content", "Explore art direction", "Outline the journal"];
  await page.route("**/api/board/cards/*/move", (route) => route.fulfill({ status: 500 }));
  await source.getByRole("button", { name: "Move Audit existing content" }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await expect(target).toHaveAttribute("data-drop-target", "true");
  await page.keyboard.press("Space");

  const alert = page.getByRole("region", { name: "Board view" }).getByRole("alert");
  await expect(alert).toContainText("could not be saved");
  await expect(source.getByRole("heading", { level: 4 })).toHaveText(original);
  await expect(target.getByRole("article")).toHaveCount(2);
  await alert.getByRole("button", { name: "Dismiss" }).click();
  await expect(alert).toHaveCount(0);

  await page.unrouteAll();
  await reloadWhenSaved(page);
  await expect(source.getByRole("heading", { level: 4 })).toHaveText(original);
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
  await reloadWhenSaved(page);
  await expect(target.getByRole("heading", { level: 4 })).toHaveText(["Audit existing content"]);
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
  await reloadWhenSaved(page);
  await expect(lane(page, "Design QA").getByRole("heading", { level: 4 })).toHaveText([
    "Review the prototype", "Proofread the studio bio", "Release checklist",
  ]);
  await expect(page.getByRole("article", { name: "Release checklist" }).locator("p")).toHaveCount(0);
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
  await expect(source.locator("[data-insert-before]")).toHaveAccessibleName("Audit existing content");
  await page.keyboard.press("Space");
  await expect(titles).toHaveText([second, first, third]);
  await expect(page.locator("[data-drop-target], [data-dragging], [data-dropping]")).toHaveCount(0);
  await expect(handle).toBeFocused();
  await page.keyboard.press("Space");
  await expect(source).toHaveAttribute("data-drop-target", "true");
  await page.keyboard.press("ArrowDown");
  await expect(source.locator("[data-insert-before]")).toHaveAccessibleName("Outline the journal");
  await page.keyboard.press("Escape");
  await expect(titles).toHaveText([second, first, third]);
});
