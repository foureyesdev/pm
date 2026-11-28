"""SQLite storage for each user's board, following docs/schema.json and docs/database.md.

The mutation functions take an open transaction and a board ID so a batch of them can run
inside one Store.update call. The AI integration reuses them the same way.
"""

import sqlite3
from collections.abc import Callable, Iterator
from contextlib import closing, contextmanager
from pathlib import Path
from uuid import uuid4

STAGES = ("backlog", "ready", "progress", "review", "done")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE CHECK (length(trim(username)) > 0)
) STRICT;
CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
) STRICT;
CREATE TABLE IF NOT EXISTS board_columns (
  board_id INTEGER NOT NULL REFERENCES boards(id),
  id TEXT NOT NULL CHECK (id IN ('backlog', 'ready', 'progress', 'review', 'done')),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  PRIMARY KEY (board_id, id)
) STRICT;
CREATE TABLE IF NOT EXISTS cards (
  board_id INTEGER NOT NULL,
  id TEXT NOT NULL,
  column_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  details TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (board_id, id),
  FOREIGN KEY (board_id, column_id) REFERENCES board_columns(board_id, id),
  UNIQUE (board_id, column_id, position)
) STRICT;
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES boards(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (length(trim(content)) > 0)
) STRICT;
CREATE INDEX IF NOT EXISTS chat_messages_by_board ON chat_messages(board_id, id);
"""

SEED_TITLE = "Website launch"
SEED_DESCRIPTION = "Design, content, and development for our new studio website."
SEED_COLUMNS = [
    ("backlog", "Backlog", [
        ("content-audit", "Audit existing content", "Flag the pages to keep, rewrite, or retire before launch."),
        ("art-direction", "Explore art direction", "Gather type, color, and photography references for the new site."),
        ("journal", "Outline the journal", "Choose the first three stories for launch week."),
    ]),
    ("ready", "Ready", [
        ("homepage-copy", "Write homepage copy", "Draft the opening headline and a short introduction to the studio."),
        ("project-images", "Prepare project imagery", "Select hero images for the featured case studies."),
    ]),
    ("progress", "In progress", [
        ("homepage", "Build the homepage", "Bring the approved layout to life on desktop and mobile."),
        ("case-studies", "Design case studies", "Create a flexible page for telling each project’s story."),
        ("mobile-nav", "Refine mobile navigation", "Connect the main pages and tune the menu interactions."),
    ]),
    ("review", "Review", [
        ("prototype", "Review the prototype", "Walk through the main journeys and collect final feedback."),
        ("studio-bio", "Proofread the studio bio", "Check the team names, links, and tone of voice."),
    ]),
    ("done", "Done", [
        ("sitemap", "Define the sitemap", "Agree on the page structure and primary navigation."),
        ("wireframes", "Approve the wireframes", "Sign off on the core layouts with the studio team."),
    ]),
]

type Db = sqlite3.Connection


class NotFound(LookupError):
    """A referenced column or card does not exist on the user's board."""


class Invalid(ValueError):
    """A value or insertion anchor is not acceptable."""


class Store:
    def __init__(self, path: Path | str):
        self.path = Path(path)
        with closing(sqlite3.connect(self.path)) as db:
            db.executescript(SCHEMA)

    def board(self, username: str) -> dict:
        with self._transaction() as db:
            return read_board(db, board_for(db, username))

    def update(self, username: str, change: Callable[[Db, int], object]) -> dict:
        """Apply change(db, board_id) and one revision increment in a single transaction."""
        with self._transaction() as db:
            board = board_for(db, username)
            change(db, board)
            db.execute("UPDATE boards SET revision = revision + 1 WHERE id = ?", (board,))
            return read_board(db, board)

    @contextmanager
    def _transaction(self) -> Iterator[Db]:
        with closing(sqlite3.connect(self.path, autocommit=True)) as db:
            db.execute("PRAGMA foreign_keys = ON")
            db.execute("BEGIN IMMEDIATE")
            try:
                yield db
            except BaseException:
                db.execute("ROLLBACK")
                raise
            db.execute("COMMIT")


def board_for(db: Db, username: str) -> int:
    """Find the user's board, creating and seeding it on first use."""
    db.execute("INSERT INTO users (username) VALUES (?) ON CONFLICT (username) DO NOTHING", (username,))
    (user,) = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if row := db.execute("SELECT id FROM boards WHERE user_id = ?", (user,)).fetchone():
        return row[0]
    board = db.execute(
        "INSERT INTO boards (user_id, title, description) VALUES (?, ?, ?)", (user, SEED_TITLE, SEED_DESCRIPTION)
    ).lastrowid
    for column, name, cards in SEED_COLUMNS:
        db.execute("INSERT INTO board_columns (board_id, id, name) VALUES (?, ?, ?)", (board, column, name))
        db.executemany(
            "INSERT INTO cards (board_id, id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?, ?)",
            [(board, card, column, title, details, position) for position, (card, title, details) in enumerate(cards)],
        )
    return board


def read_board(db: Db, board: int) -> dict:
    title, description, revision = db.execute(
        "SELECT title, description, revision FROM boards WHERE id = ?", (board,)
    ).fetchone()
    columns = {
        column: {"id": column, "name": name, "cards": []}
        for column, name in db.execute("SELECT id, name FROM board_columns WHERE board_id = ?", (board,))
    }
    for card, column, card_title, details in db.execute(
        "SELECT id, column_id, title, details FROM cards WHERE board_id = ? ORDER BY position", (board,)
    ):
        columns[column]["cards"].append({"id": card, "title": card_title, "details": details})
    return {
        "title": title,
        "description": description,
        "revision": revision,
        "columns": [columns[stage] for stage in STAGES],
    }


def rename_column(db: Db, board: int, column: str, name: str) -> None:
    name = required(name, "Column name")
    if db.execute(
        "UPDATE board_columns SET name = ? WHERE board_id = ? AND id = ?", (name, board, column)
    ).rowcount == 0:
        raise NotFound(f"Unknown column {column!r}")


def create_card(db: Db, board: int, column: str, title: str, details: str = "") -> str:
    title = required(title, "Card title")
    position = len(column_cards(db, board, column))
    card = str(uuid4())
    db.execute(
        "INSERT INTO cards (board_id, id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?, ?)",
        (board, card, column, title, details.strip(), position),
    )
    return card


def edit_card(db: Db, board: int, card: str, title: str | None = None, details: str | None = None) -> None:
    title = None if title is None else required(title, "Card title")
    details = None if details is None else details.strip()
    if db.execute(
        "UPDATE cards SET title = coalesce(?, title), details = coalesce(?, details) WHERE board_id = ? AND id = ?",
        (title, details, board, card),
    ).rowcount == 0:
        raise NotFound(f"Unknown card {card!r}")


def delete_card(db: Db, board: int, card: str) -> None:
    source = card_column(db, board, card)
    db.execute("DELETE FROM cards WHERE board_id = ? AND id = ?", (board, card))
    write_order(db, board, {source: column_cards(db, board, source)})


def move_card(db: Db, board: int, card: str, column: str, before: str | None = None) -> None:
    """Move a card to the end of a column, or before another card in that column."""
    source = card_column(db, board, card)
    target = [item for item in column_cards(db, board, column) if item != card]
    if before is None:
        target.append(card)
    elif before in target:
        target.insert(target.index(before), card)
    else:
        raise Invalid("beforeId must name another card in the destination column")
    order = {source: [item for item in column_cards(db, board, source) if item != card]}
    order[column] = target
    write_order(db, board, order)


def write_order(db: Db, board: int, order: dict[str, list[str]]) -> None:
    """Store each column's card IDs at positions from zero.

    Shifting the affected rows above every occupied position first frees the final positions,
    so the unique position constraint holds after each row update.
    """
    (offset,) = db.execute("SELECT coalesce(max(position), -1) + 1 FROM cards WHERE board_id = ?", (board,)).fetchone()
    marks = ", ".join("?" * len(order))
    db.execute(
        f"UPDATE cards SET position = position + ? WHERE board_id = ? AND column_id IN ({marks})",
        (offset, board, *order),
    )
    db.executemany(
        "UPDATE cards SET column_id = ?, position = ? WHERE board_id = ? AND id = ?",
        [(column, position, board, card) for column, cards in order.items() for position, card in enumerate(cards)],
    )


def column_cards(db: Db, board: int, column: str) -> list[str]:
    if not db.execute("SELECT 1 FROM board_columns WHERE board_id = ? AND id = ?", (board, column)).fetchone():
        raise NotFound(f"Unknown column {column!r}")
    rows = db.execute(
        "SELECT id FROM cards WHERE board_id = ? AND column_id = ? ORDER BY position", (board, column)
    )
    return [card for (card,) in rows]


def card_column(db: Db, board: int, card: str) -> str:
    row = db.execute("SELECT column_id FROM cards WHERE board_id = ? AND id = ?", (board, card)).fetchone()
    if row is None:
        raise NotFound(f"Unknown card {card!r}")
    return row[0]


def required(value: str, label: str) -> str:
    value = value.strip()
    if not value:
        raise Invalid(f"{label} must not be blank")
    return value
