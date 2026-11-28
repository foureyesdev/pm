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

The Dockerfile copies every top-level `backend/*.py` module into the image.

`tests/test_storage.py` runs against temporary databases without the container. Start the container with the project scripts. From the repository root, run `python -m unittest discover -s backend/tests` against the running service.
