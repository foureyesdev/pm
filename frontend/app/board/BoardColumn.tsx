import { pointerIntersection } from "@dnd-kit/collision";
import { useDraggable, useDroppable } from "@dnd-kit/react";
import { Check, CircleDashed, CircleDot, CirclePlay, Eye, GripVertical, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CardComposer, CardForm, ColumnName } from "./ColumnControls";
import type { BoardChange, Card, Column } from "./model";
import styles from "./board.module.css";

const stageIcons = { backlog: CircleDashed, ready: CircleDot, progress: CirclePlay, review: Eye, done: Check };

function TaskCard({ card, insertBefore, onEdit, onDelete }: {
  card: Card;
  insertBefore: boolean;
  onEdit: (title: string, details: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const { ref, handleRef, isDragging, isDropping } = useDraggable({ id: card.id, disabled: editing });

  function close() {
    flushSync(() => setEditing(false));
    editButton.current?.focus();
  }

  return (
    <article ref={ref} data-card-id={card.id} data-insert-before={insertBefore || undefined} aria-label={card.title} className={styles.card} data-editing={editing || undefined} data-dragging={isDragging || undefined} data-dropping={isDropping || undefined}>
      {/* The tools stay mounted while editing: unmounting the handle makes dnd-kit turn the card into a button. */}
      <div className={styles.cardTools}>
        <span className={styles.cardAccent} aria-hidden="true" />
        <button type="button" ref={editButton} className={styles.edit} aria-label={`Edit ${card.title}`} title="Edit card" hidden={editing} onClick={() => setEditing(true)}>
          <Pencil size={14} aria-hidden="true" />
        </button>
        <button type="button" className={styles.delete} aria-label={`Delete ${card.title}`} title="Delete card" hidden={editing} onClick={onDelete}>
          <Trash2 size={14} aria-hidden="true" />
        </button>
        <button type="button" id={`move-${card.id}`} ref={handleRef} className={styles.handle} aria-label={`Move ${card.title}`} title="Drag to move · Space to pick up with keyboard" hidden={editing}>
          <GripVertical size={16} aria-hidden="true" />
        </button>
      </div>
      {editing ? (
        <CardForm
          label={`Edit ${card.title}`}
          submitLabel="Save"
          initial={card}
          onSubmit={(title, details) => {
            if (title !== card.title || details !== card.details) onEdit(title, details);
            close();
          }}
          onCancel={close}
        />
      ) : (
        <>
          <h4>{card.title}</h4>
          {card.details && <p>{card.details}</p>}
        </>
      )}
    </article>
  );
}

export function BoardColumn({ column, beforeId, onChange }: { column: Column; beforeId: string | null; onChange: (change: BoardChange) => void }) {
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
        <ColumnName name={column.name} onSave={(name) => onChange({ type: "rename", columnId: column.id, name })} />
        <span className={styles.count} aria-label={`${column.cards.length} cards`}>{column.cards.length}</span>
      </div>
      <div className={styles.cards} data-insert-end={isDropTarget && beforeId === null || undefined}>
        {column.cards.map((card) => (
          <TaskCard
            key={card.id}
            card={card}
            insertBefore={isDropTarget && beforeId === card.id}
            onEdit={(title, details) => onChange({ type: "edit", cardId: card.id, title, details })}
            onDelete={() => onChange({ type: "delete", columnId: column.id, cardId: card.id })}
          />
        ))}
      </div>
      <CardComposer
        columnName={column.name}
        onAdd={(title, details) => onChange({ type: "create", columnId: column.id, title, details })}
      />
    </section>
  );
}
