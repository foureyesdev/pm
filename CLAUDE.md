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

The container does not hot-reload. Rerun the start script after any frontend or backend change before running HTTP or browser tests.

Frontend (from `frontend/`, after `npm ci`):

```sh
npm run lint
npm run typecheck                            # next typegen && tsc --noEmit
npm test                                     # Vitest (tests/unit, jsdom)
npx vitest run tests/unit/model.test.ts      # single unit test file
npm run test:e2e                             # Playwright against the packaged app on :8000
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
- **Board state**: the frontend still runs on client state (`frontend/app/board/model.ts` reducer, `seed.ts` sample data) until Part 7 wires it to the API. The five fixed stage IDs are `backlog`, `ready`, `progress`, `review`, `done`. A move is `{cardId, destination column, optional beforeId}` (null/omitted anchor appends) on both sides.
- **Storage**: `backend/storage.py` implements `docs/schema.json` and `docs/database.md` in `/data/fieldwork.sqlite3` (per-board stage rows, zero-based card positions, board revision counter for stale AI updates, chat messages per board). The seed is duplicated in `storage.py` and `seed.ts`. Board routes and route details are in `backend/AGENTS.md`. `tests/test_board_routes.py` runs against the shared `user` board in the volume and restores what it changes.
- **Playwright** runs against the packaged app, not the dev server. Its `webServer` runs `npm start` (`docker compose up --build`) only if `/api/health` is not already up, so a stale running container is reused. Projects are `chromium`, `firefox`, `webkit` (`board.spec.ts`, `session.spec.ts`) and `mobile-chromium` on an emulated Pixel 7 (`mobile.spec.ts`, `session.spec.ts`). `tests/e2e/signed-in.ts` provides the signed-in fixture.

## Gotchas

- The installed Next.js (16.x) may differ from training data. Read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing Next.js code.
- `next dev` rewrites the `nextjs-agent-rules` block in `frontend/AGENTS.md`. Leave the block in place rather than deleting it from a diff.
- `OPENROUTER_API_KEY` is in the root `.env`, which is excluded from the image. Pass it to the container at runtime when the AI parts are implemented.
