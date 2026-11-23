export interface Card {
  id: string;
  title: string;
  details: string;
}

export interface Column {
  id: "backlog" | "ready" | "progress" | "review" | "done";
  name: string;
  cards: Card[];
}

export type BoardAction =
  | { type: "rename"; columnId: string; name: string }
  | { type: "add"; columnId: string; card: Card }
  | { type: "delete"; columnId: string; cardId: string }
  | { type: "move"; columnId: string; cardId: string; beforeId?: string | null };

export function boardReducer(columns: Column[], action: BoardAction): Column[] {
  const destination = columns.find((column) => column.id === action.columnId);
  if (!destination) return columns;

  switch (action.type) {
    case "rename": {
      const name = action.name.trim();
      if (!name || name === destination.name) return columns;
      return columns.map((column) => column === destination ? { ...column, name } : column);
    }
    case "add": {
      const title = action.card.title.trim();
      if (!title) return columns;
      const card = { ...action.card, title, details: action.card.details.trim() };
      return columns.map((column) =>
        column === destination ? { ...column, cards: [...column.cards, card] } : column
      );
    }
    case "delete":
      return columns.map((column) =>
        column === destination
          ? { ...column, cards: column.cards.filter((card) => card.id !== action.cardId) }
          : column
      );
    case "move": {
      const source = columns.find((column) => column.cards.some((card) => card.id === action.cardId));
      const card = source?.cards.find((item) => item.id === action.cardId);
      if (!card) return columns;
      const remaining = destination.cards.filter((item) => item !== card);
      const index = action.beforeId == null ? remaining.length : remaining.findIndex((item) => item.id === action.beforeId);
      if (index < 0 || (source === destination && destination.cards[index] === card)) return columns;
      const ordered = [...remaining.slice(0, index), card, ...remaining.slice(index)];
      return columns.map((column) => {
        if (column === destination) return { ...column, cards: ordered };
        if (column === source) return { ...column, cards: column.cards.filter((item) => item !== card) };
        return column;
      });
    }
  }
}
