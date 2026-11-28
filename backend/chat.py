"""One AI chat turn: read the board and history, ask the model, then apply its reply.

The model call runs outside any transaction. Its batch of card operations is then applied in one
transaction, together with the user's message and the reply, only if the board revision is
unchanged. Any invalid operation rolls back the whole turn.
"""

import json
from collections.abc import Callable

import ai
import storage

SYSTEM_PROMPT = """You are the assistant in Fieldwork, a project management app. You help the user with their \
kanban board: answer questions about it and make the card changes they ask for.

Always call the respond function. Put your message to the user in `reply`. Put the card changes to \
make, in order, in `operations`, or leave it empty when no change is asked for:
- create: `columnId` and `title`, optionally `details`. The new card goes at the end of the column.
- edit: `cardId` and the new `title` and/or `details`.
- move: `cardId`, the destination `columnId`, and `beforeId`, the ID of the card it should go \
before in that column, or null to put it last.

Use only column and card IDs that appear in the board below. You cannot add, rename, or delete \
columns, or delete cards. Describe in `reply` what you changed.

Current board as JSON:
"""

RESPOND = {
    "name": "respond",
    "description": "Reply to the user and list the card changes to apply, in order.",
    "parameters": {
        "type": "object",
        "properties": {
            "reply": {"type": "string", "description": "The message shown to the user."},
            "operations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {"type": "string", "enum": ["create", "edit", "move"]},
                        "cardId": {"type": ["string", "null"], "description": "Existing card, for edit and move."},
                        "columnId": {"type": ["string", "null"], "enum": [*storage.STAGES, None]},
                        "beforeId": {"type": ["string", "null"], "description": "For move: card to go before, or null for last."},
                        "title": {"type": ["string", "null"]},
                        "details": {"type": ["string", "null"]},
                    },
                    "required": ["type"],
                },
            },
        },
        "required": ["reply", "operations"],
    },
}

# The fields each operation needs (required) and may use (optional), all strings.
OPERATIONS = {
    "create": ({"columnId", "title"}, {"details"}),
    "edit": ({"cardId"}, {"title", "details"}),
    "move": ({"cardId", "columnId"}, {"beforeId"}),
}


class ChatError(Exception):
    """A turn that saved nothing. `kind` is an ai.AIError kind, "reply" for an unusable reply, or "stale"."""

    def __init__(self, status: int, kind: str, message: str):
        super().__init__(message)
        self.status = status
        self.kind = kind


def history(store: storage.Store, username: str) -> list[dict]:
    return store.run(username, storage.read_messages)


def send(store: storage.Store, username: str, message: str, complete: Callable[..., str] = ai.complete) -> dict:
    """Run one turn and return the saved user message and reply with the resulting board."""
    message = storage.required(message, "Message")
    board, earlier = store.run(username, lambda db, id: (storage.read_board(db, id), storage.read_messages(db, id)))
    snapshot = {key: board[key] for key in ("title", "description", "columns")}
    prompt = [
        {"role": "system", "content": SYSTEM_PROMPT + json.dumps(snapshot)},
        *({"role": item["role"], "content": item["content"]} for item in earlier),
        {"role": "user", "content": message},
    ]
    try:
        arguments = complete(prompt, tool=RESPOND)
    except ai.AIError as error:
        raise ChatError(503 if error.kind == "configuration" else 502, error.kind, str(error)) from None
    reply, operations = parse(arguments)

    def commit(db: storage.Db, id: int) -> dict:
        (revision,) = db.execute("SELECT revision FROM boards WHERE id = ?", (id,)).fetchone()
        if revision != board["revision"]:
            raise ChatError(409, "stale", "The board changed while the assistant was replying. Send your message again.")
        try:
            for operation in operations:
                apply(db, id, operation)
        except (storage.NotFound, storage.Invalid) as error:
            raise ChatError(502, "reply", f"The assistant's changes could not be applied: {error}") from None
        if operations:
            storage.bump_revision(db, id)
        saved = [storage.add_message(db, id, "user", message), storage.add_message(db, id, "assistant", reply)]
        return {"messages": saved, "board": storage.read_board(db, id)}

    return store.run(username, commit)


def parse(arguments: str) -> tuple[str, list[dict]]:
    """Check the shape of the model's respond call. Board references are checked when applying."""
    try:
        data = json.loads(arguments)
        reply, operations = data["reply"], data["operations"]
    except (ValueError, KeyError, TypeError):
        raise ChatError(502, "reply", "The assistant's reply was not in the expected format.") from None
    if not isinstance(reply, str) or not reply.strip() or not isinstance(operations, list):
        raise ChatError(502, "reply", "The assistant's reply was not in the expected format.")
    for number, operation in enumerate(operations, 1):
        fields = OPERATIONS.get(operation.get("type")) if isinstance(operation, dict) else None
        if fields is None:
            raise ChatError(502, "reply", f"Operation {number} has an unknown type.")
        needed, optional = fields
        given = {key for key in needed | optional if operation.get(key) is not None}
        if not needed <= given or any(not isinstance(operation[key], str) for key in given):
            raise ChatError(502, "reply", f"Operation {number} ({operation['type']}) is missing a field.")
        if operation["type"] == "edit" and given == {"cardId"}:
            raise ChatError(502, "reply", f"Operation {number} (edit) changes nothing.")
    return reply.strip(), operations


def apply(db: storage.Db, board: int, operation: dict) -> None:
    match operation["type"]:
        case "create":
            storage.create_card(db, board, operation["columnId"], operation["title"], operation.get("details") or "")
        case "edit":
            storage.edit_card(db, board, operation["cardId"], operation.get("title"), operation.get("details"))
        case "move":
            storage.move_card(db, board, operation["cardId"], operation["columnId"], operation.get("beforeId"))
