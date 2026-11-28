# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Project requirements, coding standards, color scheme, and the AI model choice live in @AGENTS.md. The step-by-step plan with acceptance criteria is @docs/PLAN.md: check which part is in progress before starting work, and tick its boxes and add a short verification note when a part is done. Do not start a part until the previous part's acceptance box is ticked; some require explicit user sign-off. Each subdirectory has its own `AGENTS.md` with detail on that area (`backend/`, `frontend/`, `scripts/`).

## Commands

The app runs as one Docker Compose service on http://127.0.0.1:8000/ with a named volume mounted at `/data`.

```sh
.\scripts\start.ps1      # Windows: build and start, waits for /api/health
.\scripts\stop.ps1
sh scripts/start.sh      # macOS/Linux
sh scripts/stop.sh
```

The container does not hot-reload. Rerun the start script after any frontend or backend change before running the HTTP tests or checking :8000 by hand. Browser tests build their own instance.

Frontend (from `frontend/`, after `npm ci`):

```sh
npm run lint
npm run typecheck                            # next typegen && tsc --noEmit
npm test                                     # Vitest (tests/unit, jsdom)
npx vitest run tests/unit/model.test.ts      # single unit test file
npm run test:e2e                             # Playwright against a separate packaged app on :8001
npx playwright test tests/e2e/board.spec.ts --project=chromium   # single spec/browser
npm run dev                                  # dev server; proxies /api/* to :8000 (container must be running)
```

Backend tests are stdlib `unittest` HTTP tests that hit the running container (no pytest, no in-process TestClient). From the repo root:

```sh
python -m unittest discover -s backend/tests
python -m unittest discover -s backend/tests -p test_sessions.py
```

Backend dependencies are managed with uv; after editing `backend/pyproject.toml`, run `uv lock` in `backend/`. The Docker build uses `uv sync --locked`.

## Architecture

- **Single container, two build stages** (`Dockerfile`): a Node stage runs `next build` to a static export (`frontend/out/`), which is copied to `/app/static/` in the Python 3.14 uv image. FastAPI (`backend/main.py`, `main:app`) serves the API and the static site. `backend/static/` is empty locally; it is only populated in the image.
- **The Dockerfile copies files explicitly**: only top-level `backend/*.py` modules go into the runtime image, and only `frontend/app/`, `tsconfig.json`, and `next.config.mjs` go into the Node build stage. A backend subpackage or a new top-level frontend directory (for example `lib/` or `public/`) needs matching `COPY` and `.dockerignore` entries, or the packaged app breaks while local unit tests still pass.
- **Route ordering matters**: all `/api/*` routes must be registered before the catch-all `StaticFiles` mount at `/` at the bottom of `main.py`, otherwise they are shadowed. Unknown paths fall through to FastAPI's JSON 404.
- **Next.js config is phase-dependent** (`frontend/next.config.mjs`): dev mode adds the `/api` rewrite to port 8000; builds use `output: "export"`. No server-side Next.js features (API routes, SSR-only APIs) are available in the packaged app.
- **Auth**: `POST/GET/DELETE /api/session` with hardcoded `user`/`password`. Tokens live in an in-memory dict and an HTTP-only `fieldwork_session` cookie, so restarting the container signs everyone out. Protect new routes with `Depends(current_user)`, which returns the username.
- **Board state**: the server is the source of truth. `frontend/app/board/useBoard.ts` loads the board and sends changes in order. The `model.ts` reducer shows renames, edits, deletes, and moves before the server confirms them, and the board then takes the server's saved state. Card IDs come from the server. The five fixed stage IDs are `backlog`, `ready`, `progress`, `review`, `done`. A move is `{cardId, destination column, optional beforeId}` (null/omitted anchor appends) on both sides.
- **Storage**: `backend/storage.py` implements `docs/schema.json` and `docs/database.md` in `/data/fieldwork.sqlite3` (per-board stage rows, zero-based card positions, board revision counter for stale AI updates, chat messages per board). The sample cards are listed in `storage.py` and again in `frontend/tests/e2e/signed-in.ts`. Board routes and route details are in `backend/AGENTS.md`. `tests/test_board_routes.py` runs against the shared `user` board on :8000 and restores what it changes.
- **Playwright** runs against the packaged app, not the dev server. Its global setup rebuilds and starts a separate Compose project (`fieldwork-e2e`, `FIELDWORK_PORT=8001`, empty volume) and removes it afterwards. The fixture resets the board before each test, so there is one worker. Projects are `chromium`, `firefox`, `webkit` (`board.spec.ts`, `session.spec.ts`) and `mobile-chromium` on an emulated Pixel 7 (`mobile.spec.ts`, `session.spec.ts`). `tests/e2e/signed-in.ts` provides the signed-in fixture.

## Gotchas

- The installed Next.js (16.x) may differ from training data. Read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing Next.js code.
- `next dev` rewrites the `nextjs-agent-rules` block in `frontend/AGENTS.md`. Leave the block in place rather than deleting it from a diff.
- `OPENROUTER_API_KEY` is in the root `.env`, which is excluded from the image. Compose loads it at runtime through an optional `env_file`. `backend/ai.py` is the only code that reads it. Live check: `docker compose exec app /app/.venv/bin/python ai.py`.
- Python is not installed on the Windows host here. Run the backend tests with Python 3.14 in WSL: `wsl -e sh -c "cd /mnt/c/Users/loren/Desktop/Projects/pm && python3 -m unittest discover -s backend/tests"`.
