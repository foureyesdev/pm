import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board } from "../../app/board/Board";
import type { Board as BoardData, Card } from "../../app/board/model";

const audit = { id: "a", title: "Audit pages", details: "Old notes" };
const brief = { id: "b", title: "Write brief", details: "" };

function board(backlog: Card[], revision = 0): BoardData {
  return {
    title: "Website launch",
    description: "",
    revision,
    columns: [
      { id: "backlog", name: "Backlog", cards: backlog },
      { id: "ready", name: "Ready", cards: [] },
      { id: "progress", name: "In progress", cards: [] },
      { id: "review", name: "Review", cards: [] },
      { id: "done", name: "Done", cards: [] },
    ],
  };
}

function reply(status: number, body?: unknown) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

// Board requests get the queued replies in order. The chat panel loads an empty history and
// gets `chatReply` when a message is sent.
const fetchMock = vi.fn<typeof fetch>();
let boardReplies: Response[] = [];
let chatReply: Response | undefined;
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (path, init) => {
    if (path === "/api/chat") return init?.method === "POST" ? chatReply! : reply(200, { messages: [] });
    const next = boardReplies.shift();
    if (!next) throw new Error(`Unexpected request ${init?.method ?? "GET"} ${path}`);
    return next;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

async function renderBoard(...replies: Response[]) {
  boardReplies = replies;
  const onSignedOut = vi.fn();
  render(<Board onSignedOut={onSignedOut} />);
  return { user: userEvent.setup(), onSignedOut };
}

function boardCalls() {
  return fetchMock.mock.calls.filter(([path]) => String(path).startsWith("/api/board"));
}

function sent(index: number) {
  const [path, init] = boardCalls()[index];
  return { path, method: init?.method, body: init?.body && JSON.parse(String(init.body)) };
}

describe("board", () => {
  it("edits a card and shows the server's saved version", async () => {
    const saved = { ...audit, title: "Audit every page", details: "" };
    const { user } = await renderBoard(reply(200, board([audit, brief])), reply(200, board([saved, brief])));
    await user.click(await screen.findByRole("button", { name: "Edit Audit pages" }));
    const form = within(screen.getByRole("form", { name: "Edit Audit pages" }));
    const title = form.getByRole("textbox", { name: "Title" });
    expect(title).toHaveFocus();
    expect(title).toHaveValue("Audit pages");
    expect(form.getByRole("textbox", { name: /Details/ })).toHaveValue("Old notes");

    await user.clear(title);
    expect(form.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(title, "  Audit every page  ");
    await user.clear(form.getByRole("textbox", { name: /Details/ }));
    await user.click(form.getByRole("button", { name: "Save" }));

    expect(sent(1)).toEqual({ path: "/api/board/cards/a", method: "PATCH", body: { title: "Audit every page", details: "" } });
    expect(await screen.findByRole("button", { name: "Edit Audit every page" })).toHaveFocus();
    const cards = screen.getAllByRole("article");
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual(["Audit every page", "Write brief"]);
    expect(cards[0]).not.toHaveTextContent("Old notes");
  });

  it.each(["{Escape}", "Cancel"])("discards an edit via %s without saving", async (method) => {
    const { user } = await renderBoard(reply(200, board([audit])));
    await user.click(await screen.findByRole("button", { name: "Edit Audit pages" }));
    await user.type(screen.getByRole("textbox", { name: "Title" }), " changed");
    if (method === "Cancel") await user.click(screen.getByRole("button", { name: "Cancel" }));
    else await user.keyboard(method);
    expect(screen.getByRole("button", { name: "Edit Audit pages" })).toHaveFocus();
    expect(screen.getByRole("article", { name: "Audit pages" })).toHaveTextContent("Old notes");
    expect(boardCalls()).toHaveLength(1);
  });

  it("shows cards changed by a chat turn without reloading", async () => {
    const created = { id: "c", title: "Launch checklist", details: "" };
    chatReply = reply(200, {
      messages: [{ id: 1, role: "user", content: "Add a checklist" }, { id: 2, role: "assistant", content: "Added it." }],
      board: board([audit, created], 1),
    });
    const { user } = await renderBoard(reply(200, board([audit])));
    await user.type(await screen.findByRole("textbox", { name: "Message" }), "Add a checklist{Enter}");
    expect(await screen.findByRole("article", { name: "Launch checklist" })).toBeVisible();
    expect(boardCalls()).toHaveLength(1);
  });

  it("keeps a newer saved board when an older one arrives later", async () => {
    chatReply = reply(200, { messages: [], board: board([audit, brief], 1) });
    const { user } = await renderBoard(reply(200, board([audit, brief], 0)), reply(200, board([audit], 2)));
    await user.click(await screen.findByRole("button", { name: "Delete Write brief" }));
    await vi.waitFor(() => expect(boardCalls()).toHaveLength(2));
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Anything{Enter}");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ method: "POST" })));
    await vi.waitFor(() => expect(screen.queryByText("Assistant is replying…")).not.toBeInTheDocument());
    expect(screen.getAllByRole("article").map((card) => card.getAttribute("aria-label"))).toEqual(["Audit pages"]);
  });

  it("restores the saved board and reports a failed write", async () => {
    const { user } = await renderBoard(reply(200, board([audit, brief])), reply(500));
    await user.click(await screen.findByRole("button", { name: "Delete Write brief" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
    expect(sent(1)).toMatchObject({ path: "/api/board/cards/b", method: "DELETE" });
    expect(screen.getByRole("article", { name: "Write brief" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("adds a card once the server assigns its ID", async () => {
    const created = { id: "server-id", title: "Launch notes", details: "Draft" };
    const { user } = await renderBoard(reply(200, board([audit])), reply(201, board([audit, created])));
    const backlog = within(await screen.findByRole("region", { name: "Backlog column" }));
    await user.click(backlog.getByRole("button", { name: "Add card" }));
    await user.type(backlog.getByRole("textbox", { name: "Title" }), "Launch notes");
    await user.type(backlog.getByRole("textbox", { name: /Details/ }), "Draft{Enter}");
    await user.click(backlog.getByRole("button", { name: "Add card" }));
    expect(sent(1)).toEqual({ path: "/api/board/cards", method: "POST", body: { columnId: "backlog", title: "Launch notes", details: "Draft" } });
    expect(await backlog.findByRole("article", { name: "Launch notes" })).toHaveAttribute("data-card-id", "server-id");
  });

  it("reports a failed load and retries", async () => {
    const { user } = await renderBoard(reply(500), reply(200, board([audit])));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("article", { name: "Audit pages" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("signs out when the session has ended", async () => {
    const { onSignedOut } = await renderBoard(reply(401));
    await vi.waitFor(() => expect(onSignedOut).toHaveBeenCalledOnce());
  });
});
