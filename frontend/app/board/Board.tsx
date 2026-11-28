"use client";

import { DragDropProvider, KeyboardSensor, PointerSensor } from "@dnd-kit/react";
import { Columns3, Grip } from "lucide-react";
import { useState } from "react";
import { BoardColumn } from "./BoardColumn";
import { boardReducer } from "./model";
import { useBoard } from "./useBoard";
import styles from "./board.module.css";

function otherCards(lane: Element, sourceId: string) {
  return Array.from(lane.querySelectorAll<HTMLElement>("article[data-card-id]"))
    .filter((card) => card.dataset.cardId !== sourceId);
}

function insertionIndex(cards: HTMLElement[], y: number) {
  const index = cards.findIndex((card) => {
    const bounds = card.getBoundingClientRect();
    return y < bounds.top + bounds.height / 2;
  });
  return index === -1 ? cards.length : index;
}

function beforeCard(lane: Element, sourceId: string, y: number) {
  const cards = otherCards(lane, sourceId);
  return cards[insertionIndex(cards, y)]?.dataset.cardId ?? null;
}

// Keyboard moves follow the lanes, including those outside the scroll viewport.
class ColumnKeyboardSensor extends KeyboardSensor {
  protected override handleMove(direction: "up" | "down" | "left" | "right", event: KeyboardEvent) {
    event.preventDefault();
    const { source, target, position } = this.manager.dragOperation;
    const current = target?.element ?? source?.element?.closest("[data-stage]");
    if (!current || !source) return;
    if (direction === "up" || direction === "down") {
      const cards = otherCards(current, String(source.id));
      const index = insertionIndex(cards, position.current.y);
      const neighbor = cards[direction === "up" ? index - 1 : index];
      if (!neighbor) return;
      neighbor.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      const bounds = neighbor.getBoundingClientRect();
      this.manager.actions.move({ event, to: {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height * (direction === "up" ? 0.25 : 0.75),
      } });
      return;
    }
    const next = direction === "right" ? current?.nextElementSibling : current?.previousElementSibling;
    if (!next) return;

    this.manager.actions.setDropTarget(next.getAttribute("data-stage"));
    next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    const bounds = next.getBoundingClientRect();
    this.manager.actions.move({
      event,
      to: {
        x: bounds.left + bounds.width / 2,
        y: Math.min(bounds.bottom - 1, Math.max(bounds.top + 1, position.current.y)),
      },
    });
  }
}

const sensors = [
  PointerSensor.configure({ activatorElements: (source) => [source.element] }),
  ColumnKeyboardSensor,
];

export function Board({ onSignedOut }: { onSignedOut: () => void }) {
  const { columns, loadFailed, saveFailed, saving, retry, change, dismissError } = useBoard(onSignedOut);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const total = columns?.reduce((count, column) => count + column.cards.length, 0) ?? 0;

  return (
    <section aria-labelledby="board-title" aria-busy={saving} className={styles.board}>
      <div className={styles.toolbar}>
        <div className={styles.boardTitle}>
          <Columns3 size={19} aria-hidden="true" />
          <h2 id="board-title">Board view</h2>
          {columns && <span className={styles.total}>{total} {total === 1 ? "card" : "cards"}</span>}
        </div>
        <p className={styles.hint}><Grip size={16} aria-hidden="true" /> Drag cards to reorder or move</p>
      </div>
      {saveFailed && (
        <div role="alert" className={styles.notice}>
          <p>Your last change could not be saved. The board shows your saved work.</p>
          <button type="button" onClick={dismissError}>Dismiss</button>
        </div>
      )}
      {loadFailed && (
        <div role="alert" className={styles.notice}>
          <p>The board could not be loaded.</p>
          <button type="button" onClick={retry}>Try again</button>
        </div>
      )}
      {!columns && !loadFailed && <p role="status" className={styles.loading}>Loading board…</p>}
      {columns && <DragDropProvider
        sensors={sensors}
        onCollision={(event, manager) => {
          // After keyboard pickup, arrows select the lane independently of scroll geometry.
          const operation = manager.dragOperation;
          if (operation.activatorEvent instanceof KeyboardEvent && operation.target) event.preventDefault();
        }}
        onDragMove={({ operation, to }) => {
          if (operation.target?.element && operation.source) {
            setBeforeId(beforeCard(operation.target.element, String(operation.source.id), (to ?? operation.position.current).y));
          }
        }}
        onDragOver={({ operation }) => {
          if (operation.target?.element && operation.source) {
            setBeforeId(beforeCard(operation.target.element, String(operation.source.id), operation.position.current.y));
          }
        }}
        onDragEnd={({ operation, canceled, nativeEvent }) => {
          const { source, target } = operation;
          if (!source) return;
          const cardId = String(source.id);
          setBeforeId(null);
          if (!canceled && target?.element) {
            const y = nativeEvent instanceof PointerEvent ? nativeEvent.clientY : operation.position.current.y;
            const move = { type: "move" as const, cardId, columnId: String(target.id), beforeId: beforeCard(target.element, cardId, y) };
            // Dropping a card where it already is saves nothing.
            if (boardReducer(columns, move) !== columns) change(move);
          }
          if (operation.activatorEvent instanceof KeyboardEvent) {
            requestAnimationFrame(() => document.getElementById(`move-${cardId}`)?.focus());
          }
        }}
      >
        <div className={styles.viewport} aria-label="Board columns" role="region" tabIndex={0}>
          <div className={styles.lanes}>
            {columns.map((column) => <BoardColumn key={column.id} column={column} beforeId={beforeId} onChange={change} />)}
          </div>
        </div>
      </DragDropProvider>}
    </section>
  );
}
