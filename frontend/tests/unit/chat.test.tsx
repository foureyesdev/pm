import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "../../app/board/ChatPanel";

const earlier = [
  { id: 1, role: "user", content: "What is left?" },
  { id: 2, role: "assistant", content: "Three cards in Backlog." },
];
const savedBoard = { title: "Website launch", description: "", revision: 3, columns: [] };

function reply(status: number, body?: unknown) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function turn(question: string, answer: string) {
  return reply(200, {
    messages: [{ id: 3, role: "user", content: question }, { id: 4, role: "assistant", content: answer }],
    board: savedBoard,
  });
}

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

async function renderChat(...replies: Response[]) {
  for (const response of replies) fetchMock.mockResolvedValueOnce(response);
  const onBoard = vi.fn();
  const onSignedOut = vi.fn();
  const onStale = vi.fn();
  render(<ChatPanel onBoard={onBoard} onSignedOut={onSignedOut} onStale={onStale} />);
  return { user: userEvent.setup(), onBoard, onSignedOut, onStale, field: screen.getByRole("textbox", { name: "Message" }) };
}

function conversation() {
  return within(screen.getByRole("log", { name: "Conversation" })).queryAllByRole("listitem").map((item) => item.textContent);
}

describe("chat panel", () => {
  it("loads the saved conversation and sends with Enter", async () => {
    let answer!: (response: Response) => void;
    const { user, onBoard, field } = await renderChat(reply(200, { messages: earlier }));
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    expect(await screen.findByText("Three cards in Backlog.")).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Assistant" })).toBeVisible();

    await user.type(field, "  Move the homepage card  {Enter}");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/chat", expect.objectContaining({
      method: "POST", body: JSON.stringify({ message: "Move the homepage card" }),
    }));
    expect(screen.getByRole("status")).toHaveTextContent("Assistant is replying");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(field).toHaveValue("");
    expect(conversation()).toEqual(["YouWhat is left?", "AssistantThree cards in Backlog.", "YouMove the homepage card"]);

    answer(turn("Move the homepage card", "Moved it to Review."));
    expect(await screen.findByText("Moved it to Review.")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(conversation()).toHaveLength(4);
    expect(onBoard).toHaveBeenCalledExactlyOnceWith(savedBoard);
    expect(field).toHaveFocus();
  });

  it("adds a new line with Shift+Enter and ignores a blank message", async () => {
    const { user, field } = await renderChat(reply(200, { messages: [] }));
    expect(await screen.findByText(/Try “Move the homepage card/)).toBeVisible();
    await user.type(field, "   {Enter}");
    await user.type(field, "First{Shift>}{Enter}{/Shift}Second");
    expect(field).toHaveValue("   First\nSecond");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["stale", 409, "The board changed while the assistant was replying"],
    ["reply", 502, "could not be used, so nothing changed"],
    ["configuration", 503, "not set up on the server"],
    ["provider", 502, "could not reply"],
  ])("explains a %s failure, restores the message, and retries", async (kind, status, notice) => {
    const { user, onBoard, onStale, field } = await renderChat(reply(200, { messages: [] }), reply(status, { detail: "x", kind }));
    await user.type(field, "Add a launch card{Enter}");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(notice);
    expect(field).toHaveValue("Add a launch card");
    expect(conversation()).toEqual([]);
    expect(onBoard).not.toHaveBeenCalled();
    expect(onStale).toHaveBeenCalledTimes(kind === "stale" ? 1 : 0);

    fetchMock.mockResolvedValueOnce(turn("Add a launch card", "Added it."));
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Added it.")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(field).toHaveValue("");
    expect(onBoard).toHaveBeenCalledOnce();
  });

  it("reports an unreachable server", async () => {
    const { user, field } = await renderChat(reply(200, { messages: [] }));
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await user.type(field, "Hello{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("could not reply");
    expect(field).toHaveValue("Hello");
  });

  it("returns to sign-in when the session has ended", async () => {
    const { user, onSignedOut, field } = await renderChat(reply(200, { messages: [] }), reply(401));
    await user.type(field, "Hello{Enter}");
    await vi.waitFor(() => expect(onSignedOut).toHaveBeenCalledOnce());
  });

  it("reports a failed history load and retries", async () => {
    const { user } = await renderChat(reply(500), reply(200, { messages: earlier }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("could not be loaded");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Three cards in Backlog.")).toBeVisible();
  });
});
