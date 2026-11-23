# SQLite storage proposal

Each user owns one board and one conversation on that board. The proposed schema lists the SQLite column definitions, constraints, indexes, and read order for all five tables. [Schema](schema.json)

## Ownership and first use

Part 6 will create `/data/fieldwork.sqlite3` in the existing Compose `data` volume and enable `PRAGMA foreign_keys = ON` on every connection. Use the username from FastAPI's `current_user` dependency to find the user and their board. Scope all column, card, and message reads and writes to that board ID. The hardcoded credentials and in-memory session tokens stay in the authentication layer.

On the first authenticated board load, use one write transaction to find or create the user and board. Only a newly created board receives the "Website launch" title, description, five stage rows, and twelve sample cards in their existing order. A unique username and unique board owner prevent concurrent first visits from creating duplicates. Loading an existing board preserves edits, including intentionally empty columns. [Seed data](../frontend/app/board/seed.ts)

## Columns and cards

Display stages in the fixed order `backlog`, `ready`, `progress`, `review`, `done`. Each board has its own row for every stage. Seeding supplies all five, and the API only allows renaming them. Renaming changes the display name. The stage ID, display order, and card references remain stable.

Card IDs are stable within a board. Two boards can reuse the same sample IDs, and two cards can share a title even in the same column. The composite foreign key makes each card reference a column on its own board. Trim user-entered names and titles and reject whitespace-only input. An empty string represents omitted details.

Store zero-based card positions within each column. To move a card, begin a write transaction, read the affected lists in order, remove the card from its source, and insert it before the destination's `beforeId`. A null or omitted anchor appends it. Reject an unknown card, destination, or anchor before writing. For a reorder or cross-column move, temporarily shift the affected rows above the highest occupied position across those columns, then assign the final column IDs and positions from zero. This frees the original positions before reusing them and keeps the unique constraint valid throughout. Append new cards at the end and compact the source after deletion. [Frontend move contract](../frontend/app/board/model.ts)

Increment the board revision once per committed board change, including a multi-card batch. In Part 9, read the board and revision together before calling the AI. When applying its requested edits, check the revision again inside the write transaction. A changed revision means the proposed edits need a fresh board snapshot.

## Conversation history

Store one row per message with its board ID, role, and text. Append each successful user message followed by the assistant reply in the same transaction as any requested board changes. Read a board's messages by ascending message ID. Reload reads that history again. Logout revokes the session cookie's token, and the next sign-in resolves the same board and history. The named volume preserves both across container recreation.

## Two-user walkthrough

| Action | Expected result |
| --- | --- |
| Give users A and B separate boards. On both boards put cards `a` and `b`, both titled "Review copy", in Ready at positions 0 and 1. Leave Review empty. | Each board can reuse the stage IDs, card IDs, and positions. |
| On A's board, rename Ready to "Queued" and move `b` before `a`. | A's `ready` column now reads `b, a`. B's Ready still reads `a, b`. |
| Move A's `b` into Review with no anchor. | A has `a` at position 0 in Queued and `b` at position 0 in Review. B's Review stays empty. |
| Save a different conversation on each board. Close and reopen the database, then look up each board by the username from a new session. | A and B each recover their own card order and their own messages in the original turn order. |
