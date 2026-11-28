# FastAPI backend

`main.py` exposes the application as `main:app`. The Docker build places the Next.js export in `/app/static/`. FastAPI serves the board at `/` and its assets at their exported paths. Register API routes before the root static mount. `GET /api/health` returns `{"status":"ok"}`.

The Docker image installs the dependencies in `pyproject.toml` using `uv sync --locked`. When changing dependencies, regenerate `uv.lock` with `uv lock` from this directory.

`POST /api/session` accepts the demo credentials as JSON and sets an HTTP-only session cookie. `GET /api/session` returns the current username or a 401. `DELETE /api/session` revokes the token and clears the cookie. Use `Depends(current_user)` for authenticated routes. The single-process server keeps sessions in memory, so restarting it requires signing in again.

`storage.py` owns the SQLite database at `/data/fieldwork.sqlite3` and uses only the standard library. `Store` creates the tables on startup and seeds a user's board on their first board request. Mutation functions such as `move_card(db, board, ...)` take an open transaction and raise `NotFound` (404) or `Invalid` (422). `Store.update(username, change)` runs one or more of them in a single transaction and increments the board revision once, so the AI integration can apply a batch through the same functions.

Board routes take JSON with camelCase fields and return the saved board (`title`, `description`, `revision`, and `columns` in stage order with ordered `cards`):

| Route | Body |
| --- | --- |
| `GET /api/board` | |
| `PATCH /api/board/columns/{columnId}` | `{name}` |
| `POST /api/board/cards` (201) | `{columnId, title, details?}`; the server assigns the card ID |
| `PATCH /api/board/cards/{cardId}` | `{title?, details?}` |
| `DELETE /api/board/cards/{cardId}` | |
| `POST /api/board/cards/{cardId}/move` | `{columnId, beforeId?}`; a null or omitted anchor appends |

`ai.py` calls OpenRouter's chat completions endpoint with the model in `ai.MODEL`, using only the standard library. `complete(messages)` returns the reply text or raises `AIError`. Its `kind` is `configuration` (missing or rejected key, no credits), `model` (unknown ID, model down, or no provider serving it), or `provider` (rate limits, timeouts, unreachable host, malformed or empty replies). Compose passes `OPENROUTER_API_KEY` from the root `.env` at runtime. The key is excluded from the image and is never included in errors or logs. For the live check, run `docker compose exec app /app/.venv/bin/python ai.py`, which asks "What is 2+2?". `tests/test_ai.py` uses a local stub server and never contacts the provider.

`chat.py` runs one AI turn in three steps:

1. Read the board and ordered history in one transaction.
2. With no transaction open, send the board JSON in the system prompt, followed by the history and the new message.
3. Check that the board revision is unchanged. Then apply the whole operation batch through the `storage.py` mutation functions, increment the revision once if anything changed, and save the user message and reply together.

The free model endpoint does not support `response_format`: OpenRouter answers 404 when `require_parameters` is set. Replies therefore come from a forced `respond` tool call (`chat.RESPOND`) carrying `reply` and `operations` (`create`, `edit`, `move`). `chat.parse` validates their shape, and the mutation functions check the IDs. A failed turn saves nothing and returns `{detail, kind}`:

| Status | `kind` | Meaning |
| --- | --- | --- |
| 409 | `stale` | The board changed while the model was replying. Retry the turn. |
| 502 | `reply` | The model's reply was malformed, or its changes could not be applied. |
| 502 | `model`, `provider` | Errors from `ai.AIError`. |
| 503 | `configuration` | The API key is missing or rejected, or the account has no credits. |

| Route | Body | Response |
| --- | --- | --- |
| `GET /api/chat` | | `{messages: [{id, role, content}]}` in order |
| `POST /api/chat` | `{message}` | `{messages: [user, assistant], board}` |

The Dockerfile copies every top-level `backend/*.py` module into the image.

`tests/test_storage.py` and `tests/test_chat.py` run against temporary databases without the container. `test_chat.py` passes a fake `complete` to `chat.send`. Start the container with the project scripts. From the repository root, run `python -m unittest discover -s backend/tests` against the running service.
