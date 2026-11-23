import { describe, expect, it } from "vitest";
import { boardReducer, type Column } from "../../app/board/model";
import { initialBoard } from "../../app/board/seed";

const original = { id: "one", title: "Launch notes", details: "Keep these details." };
const duplicate = { id: "two", title: original.title, details: "A different card." };
const board: Column[] = [
  { id: "backlog", name: "Backlog", cards: [original] },
  { id: "ready", name: "Ready", cards: [duplicate] },
  { id: "progress", name: "In progress", cards: [] },
  { id: "review", name: "Review", cards: [] },
  { id: "done", name: "Done", cards: [] },
];

describe("sample board", () => {
  it("opens with five ordered stages, each populated with uniquely identified cards", () => {
    expect(initialBoard.map((column) => column.name)).toEqual(["Backlog", "Ready", "In progress", "Review", "Done"]);
    expect(initialBoard.every((column) => column.cards.length > 0)).toBe(true);
    const ids = initialBoard.flatMap((column) => column.cards.map((card) => card.id));
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("boardReducer", () => {
  it("renames a stage without changing its identity, contents, or position", () => {
    const next = boardReducer(board, { type: "rename", columnId: "ready", name: "  Queued  " });
    expect(next[1]).toEqual({ ...board[1], name: "Queued" });
    expect(next.map((column) => column.id)).toEqual(board.map((column) => column.id));
    expect(board[1].name).toBe("Ready");
  });

  it("preserves the previous name on blank input", () => {
    expect(boardReducer(board, { type: "rename", columnId: "ready", name: "  " })).toBe(board);
  });

  it("appends a trimmed card only to the chosen column", () => {
    const next = boardReducer(board, {
      type: "add", columnId: "ready", card: { id: "new", title: "  Brief  ", details: "  Two lines\nof copy.  " },
    });
    expect(next[1].cards).toEqual([duplicate, { id: "new", title: "Brief", details: "Two lines\nof copy." }]);
    expect(next[0]).toBe(board[0]);
    expect(board[1].cards).toEqual([duplicate]);
  });

  it("accepts a title-only card and rejects a whitespace-only title", () => {
    const card = { id: "new", title: "Test mobile", details: "" };
    expect(boardReducer(board, { type: "add", columnId: "review", card })[3].cards).toEqual([card]);
    expect(boardReducer(board, { type: "add", columnId: "review", card: { ...card, title: "  " } })).toBe(board);
  });

  it("deletes only the requested ID when equal titles share a column", () => {
    const both = boardReducer(board, { type: "move", columnId: "ready", cardId: original.id });
    const next = boardReducer(both, { type: "delete", columnId: "ready", cardId: duplicate.id });
    expect(next[1].cards).toEqual([original]);
    expect(both[1].cards).toEqual([duplicate, original]);
  });

  it.each(["ready", "done"])("moves the last card into %s, preserving contents, order, and total", (columnId) => {
    const next = boardReducer(board, { type: "move", columnId, cardId: original.id });
    const before = board.find((column) => column.id === columnId)!;
    expect(next[0].cards).toEqual([]);
    expect(next.find((column) => column.id === columnId)?.cards).toEqual([...before.cards, original]);
    expect(next.flatMap((column) => column.cards)).toHaveLength(2);
    expect(board[0].cards).toEqual([original]);
  });

  it("keeps order on same-column drops and ignores missing move targets", () => {
    for (const [cardId, columnId] of [["one", "backlog"], ["one", "outside"], ["missing", "ready"]]) {
      expect(boardReducer(board, { type: "move", columnId, cardId })).toBe(board);
    }
  });
});

it("reorders equal-title cards by ID and preserves the source array", () => {
  const initial = boardReducer(board, { type: "move", columnId: "ready", cardId: original.id });
  const first = boardReducer(initial, { type: "move", columnId: "ready", cardId: original.id, beforeId: duplicate.id });
  expect(first[1].cards).toEqual([original, duplicate]);
  expect(initial[1].cards).toEqual([duplicate, original]);
  expect(boardReducer(first, { type: "move", columnId: "ready", cardId: original.id, beforeId: null })).toEqual(initial);
});
