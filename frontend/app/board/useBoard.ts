import { useCallback, useEffect, useRef, useState } from "react";
import { boardReducer, type Board, type BoardChange, type Column } from "./model";

class SignedOutError extends Error {}

async function call(method: string, path: string, body?: object): Promise<Board> {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401) throw new SignedOutError();
  if (!response.ok) throw new Error(`${method} ${path} returned ${response.status}`);
  return response.json();
}

function send(change: BoardChange) {
  switch (change.type) {
    case "rename":
      return call("PATCH", `/api/board/columns/${change.columnId}`, { name: change.name });
    case "create":
      return call("POST", "/api/board/cards", { columnId: change.columnId, title: change.title, details: change.details });
    case "edit":
      return call("PATCH", `/api/board/cards/${change.cardId}`, { title: change.title, details: change.details });
    case "delete":
      return call("DELETE", `/api/board/cards/${change.cardId}`);
    case "move":
      return call("POST", `/api/board/cards/${change.cardId}/move`, { columnId: change.columnId, beforeId: change.beforeId ?? null });
  }
}

/**
 * Loads the signed-in user's board and saves changes in order. Changes other than new cards
 * appear immediately. Once no saves are pending, or when one fails, the board shows the
 * server's last saved state.
 */
export function useBoard(onSignedOut: () => void) {
  const [columns, setColumns] = useState<Column[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const saved = useRef<Column[]>([]);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const signedOut = useRef(onSignedOut);
  useEffect(() => { signedOut.current = onSignedOut; });

  const load = useCallback(() => call("GET", "/api/board").then(
    (board) => {
      saved.current = board.columns;
      setColumns(board.columns);
    },
    (error) => {
      if (error instanceof SignedOutError) signedOut.current();
      else setLoadFailed(true);
    },
  ), []);

  useEffect(() => { void load(); }, [load]);

  function change(next: BoardChange) {
    if (next.type !== "create") setColumns((current) => current && boardReducer(current, next));
    pending.current += 1;
    setSaving(true);
    queue.current = queue.current.then(async () => {
      let failed = false;
      try {
        saved.current = (await send(next)).columns;
      } catch (error) {
        if (error instanceof SignedOutError) signedOut.current();
        failed = true;
        setSaveFailed(true);
      }
      pending.current -= 1;
      if (failed || pending.current === 0) setColumns(saved.current);
      if (pending.current === 0) setSaving(false);
    });
  }

  function retry() {
    setLoadFailed(false);
    void load();
  }

  return { columns, loadFailed, saveFailed, saving, retry, change, dismissError: () => setSaveFailed(false) };
}
