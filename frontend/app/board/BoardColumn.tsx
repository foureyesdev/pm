import { pointerIntersection } from "@dnd-kit/collision";
import { useDraggable, useDroppable } from "@dnd-kit/react";
import { Check, CircleDashed, CircleDot, CirclePlay, Eye, GripVertical, Trash2 } from "lucide-react";
import type { Dispatch } from "react";
import { CardComposer, ColumnName } from "./ColumnControls";
import type { BoardAction, Card, Column } from "./model";
import styles from "./board.module.css";

const stageIcons = { backlog: CircleDashed, ready: CircleDot, progress: CirclePlay, review: Eye, done: Check };

function TaskCard({ card, insertBefore, onDelete }: { card: Card; insertBefore: boolean; onDelete: () => void }) {
  const { ref, handleRef, isDragging, isDropping } = useDraggable({ id: card.id });
  return (
    <article ref={ref} data-card-id={card.id} data-insert-before={insertBefore || undefined} aria-labelledby={`title-${card.id}`} className={styles.card} data-dragging={isDragging || undefined} data-dropping={isDropping || undefined}>
      <div className={styles.cardTools}>
        <span className={styles.cardAccent} aria-hidden="true" />
        <button type="button" className={styles.delete} aria-label={`Delete ${card.title}`} title="Delete card" onClick={onDelete}>
          <Trash2 size={14} aria-hidden="true" />
        </button>
        <button type="button" id={`move-${card.id}`} ref={handleRef} className={styles.handle} aria-label={`Move ${card.title}`} title="Drag to move · Space to pick up with keyboard">
          <GripVertical size={16} aria-hidden="true" />
        </button>
      </div>
      <h4 id={`title-${card.id}`}>{card.title}</h4>
      {card.details && <p>{card.details}</p>}
    </article>
  );
}

export function BoardColumn({ column, beforeId, dispatch }: { column: Column; beforeId: string | null; dispatch: Dispatch<BoardAction> }) {
  const { ref, isDropTarget } = useDroppable({ id: column.id, collisionDetector: pointerIntersection });
  const Icon = stageIcons[column.id];
  return (
    <section
      ref={ref}
      aria-label={`${column.name} column`}
      className={styles.column}
      data-stage={column.id}
      data-drop-target={isDropTarget || undefined}
    >
      <div className={styles.columnHead}>
        <span className={styles.stageIcon}><Icon size={17} aria-hidden="true" /></span>
        <ColumnName name={column.name} onSave={(name) => dispatch({ type: "rename", columnId: column.id, name })} />
        <span className={styles.count} aria-label={`${column.cards.length} cards`}>{column.cards.length}</span>
      </div>
      <div className={styles.cards} data-insert-end={isDropTarget && beforeId === null || undefined}>
        {column.cards.map((card) => (
          <TaskCard key={card.id} card={card} insertBefore={isDropTarget && beforeId === card.id} onDelete={() => dispatch({ type: "delete", columnId: column.id, cardId: card.id })} />
        ))}
      </div>
      <CardComposer
        columnName={column.name}
        onAdd={(title, details) => dispatch({
          type: "add",
          columnId: column.id,
          card: { id: crypto.randomUUID(), title, details },
        })}
      />
    </section>
  );
}
