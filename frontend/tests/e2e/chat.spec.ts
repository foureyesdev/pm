import { expect, type Page } from "@playwright/test";
import { respond, test } from "./signed-in";

// The board is reset before each test, but chat history accumulates across the run, so these tests
// check the end of the conversation.

function panel(page: Page) {
  return page.getByRole("complementary", { name: "Assistant" });
}

function messages(page: Page) {
  return panel(page).getByRole("log", { name: "Conversation" }).getByRole("listitem");
}

function lane(page: Page, name: string) {
  return page.getByRole("region", { name: name + " column", exact: true });
}

async function cardId(page: Page, title: string): Promise<string> {
  const board = await (await page.request.get("/api/board")).json();
  return board.columns.flatMap((column: { cards: { id: string; title: string }[] }) => column.cards)
    .find((card: { title: string }) => card.title === title).id;
}

// Checks the end of the conversation item by item. Firefox crashes on allTextContents() here.
async function expectLastMessages(page: Page, expected: string[]) {
  const count = await messages(page).count();
  for (const [index, text] of expected.entries()) {
    await expect(messages(page).nth(count - expected.length + index)).toHaveText(text);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(12);
  await expect(panel(page).getByText("Loading conversation…")).toHaveCount(0);
});

test("answers a question, applies a multi-card request without reloading, and keeps both after sign-in", async ({ page, model }) => {
  const field = panel(page).getByRole("textbox", { name: "Message" });
  model.reply("There are 2 cards in Done.");
  await field.fill("How many cards are in Done?");
  await field.press("Enter");
  await expect(messages(page).last()).toHaveText("AssistantThere are 2 cards in Done.");
  await expect(page.getByRole("article")).toHaveCount(12);
  expect(model.requests[0].messages.at(-1)).toEqual({ role: "user", content: "How many cards are in Done?" });
  expect(model.board(0).columns[0].cards[0].title).toBe("Audit existing content");

  const audit = await cardId(page, "Audit existing content");
  const copy = await cardId(page, "Write homepage copy");
  model.reply(
    "I added a launch checklist, moved the audit to Done, and renamed the copy card.",
    { type: "create", columnId: "review", title: "Launch checklist", details: "Links, forms, and analytics" },
    { type: "move", cardId: audit, columnId: "done", beforeId: null },
    { type: "edit", cardId: copy, title: "Write launch copy" },
  );
  const request = "Add a launch checklist to Review, move the audit to Done, and rename the copy card.";
  await field.fill(request);
  await panel(page).getByRole("button", { name: "Send" }).click();

  const saved = async () => {
    await expect(lane(page, "Review").getByRole("heading", { level: 4 })).toHaveText([
      "Review the prototype", "Proofread the studio bio", "Launch checklist",
    ]);
    await expect(lane(page, "Review").getByRole("article", { name: "Launch checklist" })).toContainText("Links, forms, and analytics");
    await expect(lane(page, "Done").getByRole("heading", { level: 4 })).toHaveText([
      "Define the sitemap", "Approve the wireframes", "Audit existing content",
    ]);
    await expect(lane(page, "Ready").getByRole("heading", { level: 4 })).toHaveText(["Write launch copy", "Prepare project imagery"]);
    await expect(messages(page).last()).toContainText("I added a launch checklist");
    await expectLastMessages(page, [
      "YouHow many cards are in Done?",
      "AssistantThere are 2 cards in Done.",
      `You${request}`,
      "AssistantI added a launch checklist, moved the audit to Done, and renamed the copy card.",
    ]);
  };
  await saved();
  expect(model.requests[1].messages.slice(-3)).toEqual([
    { role: "user", content: "How many cards are in Done?" },
    { role: "assistant", content: "There are 2 cards in Done." },
    { role: "user", content: request },
  ]);

  await expect(page.getByRole("region", { name: "Board view" })).toHaveAttribute("aria-busy", "false");
  await page.reload();
  await saved();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await saved();

  model.reply("Launch checklist is in Review.");
  await field.fill("Where is the checklist?");
  await field.press("Enter");
  await expect(messages(page).last()).toHaveText("AssistantLaunch checklist is in Review.");
  const titles = model.board(2).columns[3].cards.map((card: { title: string }) => card.title);
  expect(titles).toContain("Launch checklist");
  expect(model.requests[2].messages.slice(-2)[0].content).toBe("I added a launch checklist, moved the audit to Done, and renamed the copy card.");
});

test("explains failed and stale sends, keeps the message, and retries from the keyboard", async ({ page, model }) => {
  const field = panel(page).getByRole("textbox", { name: "Message" });
  const alert = panel(page).getByRole("alert");
  const audit = await cardId(page, "Audit existing content");
  const journal = await cardId(page, "Outline the journal");
  const count = await messages(page).count();

  model.fail(429, "Rate limit exceeded: free-models-per-day");
  await field.fill("Move the audit to Ready");
  await field.press("Enter");
  await expect(alert).toContainText("The assistant could not reply");
  await expect(field).toHaveValue("Move the audit to Ready");
  await expect(messages(page)).toHaveCount(count);

  // The board changes while the model is replying, so the turn is rejected and the board refreshed.
  model.handle(async () => {
    await expect(await page.request.post(`/api/board/cards/${journal}/move`, { data: { columnId: "done" } })).toBeOK();
    return respond("Moved the audit to Ready.", [{ type: "move", cardId: audit, columnId: "ready" }]);
  });
  await alert.getByRole("button", { name: "Try again" }).focus();
  await page.keyboard.press("Enter");
  await expect(alert).toContainText("The board changed while the assistant was replying");
  await expect(lane(page, "Done").getByRole("heading", { name: "Outline the journal" })).toBeVisible();
  await expect(lane(page, "Backlog").getByRole("heading", { name: "Audit existing content" })).toBeVisible();
  await expect(messages(page)).toHaveCount(count);

  model.reply("Moved the audit to Ready.", { type: "move", cardId: audit, columnId: "ready", beforeId: null });
  await field.focus();
  await page.keyboard.press("Tab");
  await expect(panel(page).getByRole("button", { name: "Send" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(lane(page, "Ready").getByRole("heading", { level: 4 }).last()).toHaveText("Audit existing content");
  await expect(alert).toHaveCount(0);
  await expect(field).toHaveValue("");
  await expectLastMessages(page, ["YouMove the audit to Ready", "AssistantMoved the audit to Ready."]);
});

test("shows pending feedback and sends multi-line messages", async ({ page, model }) => {
  const field = panel(page).getByRole("textbox", { name: "Message" });
  let release!: () => void;
  model.handle(() => new Promise((resolve) => { release = () => resolve(respond("Noted both lines.")); }));
  await field.fill("Line one");
  await field.press("Shift+Enter");
  await field.pressSequentially("Line two");
  await field.press("Enter");

  await expect(panel(page).getByRole("status")).toHaveText("Assistant is replying…");
  await expect(panel(page).getByRole("button", { name: "Send" })).toBeDisabled();
  await expect(messages(page).last()).toHaveText("YouLine one\nLine two");
  await expect.poll(() => model.requests.at(-1)?.messages.at(-1)?.content).toBe("Line one\nLine two");
  release();
  await expect(messages(page).last()).toHaveText("AssistantNoted both lines.");
  await expect(panel(page).getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("article")).toHaveCount(12);
});
