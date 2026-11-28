import { Pencil, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import styles from "./board.module.css";

export function ColumnName({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={name}
        className={styles.nameInput}
        aria-label="Column name"
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => {
          const value = event.currentTarget.value.trim();
          if (value && value !== name) onSave(value);
          setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== "Escape") return;
          event.preventDefault();
          const input = event.currentTarget;
          if (event.key === "Escape") input.value = name;
          flushSync(() => input.blur());
          trigger.current?.focus();
        }}
      />
    );
  }

  return (
    <h3 className={styles.columnName}>
      <button type="button" ref={trigger} aria-label={`Rename ${name} column`} title="Rename column" onClick={() => setEditing(true)}>
        <span>{name}</span><Pencil size={13} aria-hidden="true" />
      </button>
    </h3>
  );
}

/** Title and details form shared by the new-card composer and the card editor. */
export function CardForm({ label, submitLabel, initial, onSubmit, onCancel }: {
  label: string;
  submitLabel: string;
  initial?: { title: string; details: string };
  onSubmit: (title: string, details: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  return (
    <form
      className={styles.form}
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        const data = new FormData(event.currentTarget);
        onSubmit(title.trim(), String(data.get("details") ?? "").trim());
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <label>Title<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Details <span>(optional)</span><textarea name="details" rows={3} defaultValue={initial?.details} /></label>
      <div className={styles.formActions}>
        <button className={styles.submit} type="submit" disabled={!title.trim()}>{submitLabel}</button>
        <button className={styles.cancel} type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export function CardComposer({ columnName, onAdd }: {
  columnName: string;
  onAdd: (title: string, details: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  function close() {
    flushSync(() => setOpen(false));
    trigger.current?.focus();
  }

  if (!open) {
    return (
      <button ref={trigger} type="button" className={styles.addCard} onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden="true" /> Add card
      </button>
    );
  }

  return (
    <CardForm
      label={`New card in ${columnName}`}
      submitLabel="Add card"
      onSubmit={(title, details) => {
        onAdd(title, details);
        close();
      }}
      onCancel={close}
    />
  );
}
