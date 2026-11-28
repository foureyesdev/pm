import { expect, test as base, type APIRequestContext } from "@playwright/test";
import { FakeModel, startModelServer } from "./fake-model";

export { respond } from "./fake-model";

// The sample board each test starts from, in display order. The server assigns new card IDs.
const sample = [
  ["backlog", "Backlog", [
    ["Audit existing content", "Flag the pages to keep, rewrite, or retire before launch."],
    ["Explore art direction", "Gather type, color, and photography references for the new site."],
    ["Outline the journal", "Choose the first three stories for launch week."],
  ]],
  ["ready", "Ready", [
    ["Write homepage copy", "Draft the opening headline and a short introduction to the studio."],
    ["Prepare project imagery", "Select hero images for the featured case studies."],
  ]],
  ["progress", "In progress", [
    ["Build the homepage", "Bring the approved layout to life on desktop and mobile."],
    ["Design case studies", "Create a flexible page for telling each project’s story."],
    ["Refine mobile navigation", "Connect the main pages and tune the menu interactions."],
  ]],
  ["review", "Review", [
    ["Review the prototype", "Walk through the main journeys and collect final feedback."],
    ["Proofread the studio bio", "Check the team names, links, and tone of voice."],
  ]],
  ["done", "Done", [
    ["Define the sitemap", "Agree on the page structure and primary navigation."],
    ["Approve the wireframes", "Sign off on the core layouts with the studio team."],
  ]],
] as const;

async function resetBoard(request: APIRequestContext) {
  const board = await (await request.get("/api/board")).json();
  for (const column of board.columns) {
    for (const card of column.cards) await expect(await request.delete(`/api/board/cards/${card.id}`)).toBeOK();
  }
  for (const [columnId, name, cards] of sample) {
    await expect(await request.patch(`/api/board/columns/${columnId}`, { data: { name } })).toBeOK();
    for (const [title, details] of cards) {
      await expect(await request.post("/api/board/cards", { data: { columnId, title, details } })).toBeOK();
    }
  }
}

type ModelServer = Awaited<ReturnType<typeof startModelServer>>;

export const test = base.extend<{ model: FakeModel }, { modelServer: ModelServer }>({
  modelServer: [async ({}, provide) => {
    const server = await startModelServer();
    await provide(server);
    await server.close();
  }, { scope: "worker", auto: true }],
  model: async ({ modelServer }, provide) => {
    const model = new FakeModel();
    modelServer.use(model);
    await provide(model);
    modelServer.use(null);
  },
  page: async ({ page }, runTest) => {
    const session = await page.request.post("/api/session", {
      data: { username: "user", password: "password" },
    });
    await expect(session).toBeOK();
    await resetBoard(page.request);
    await runTest(page);
    await page.request.delete("/api/session");
  },
});
