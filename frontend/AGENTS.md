# Fieldwork frontend

The Next.js App Router app checks the session at `/`. Sign in with `user` and `password` to open the "Website launch" board, which loads from and saves to the FastAPI board routes described in `../backend/AGENTS.md`. The server seeds the sample columns and cards on first use.

## Where to make a change

| File | Responsibility |
| --- | --- |
| `app/layout.tsx`, `app/page.tsx` | Document metadata, session lookup, sign-in form, workspace header with logout, and board entry point. An expired session returns to sign-in. |
| `app/globals.css`, `app/page.module.css`, `app/board/board.module.css` | Shared palette and bundled DM Sans font, page layout, and board styles respectively. |
| `app/board/model.ts` | Board types and a pure reducer for renaming columns and editing, deleting, or moving cards. The fixed stage IDs are `backlog`, `ready`, `progress`, `review`, and `done`. A move identifies the card, destination column, and optional `beforeId`. Omitting the anchor or passing `null` appends the card. |
| `app/board/useBoard.ts` | Loads the board and sends each change to the API in order. Changes other than new cards appear immediately. When saves finish or one fails, the board shows the server's saved state, which is the board with the highest revision received from a load, a save, or a chat turn (`receive`). New cards appear once the server returns their ID. |
| `app/board/Board.tsx` | Client entry point. Shows loading, load, and save errors, sets `aria-busy` while saves are pending, renders the scrollable lanes, and translates pointer and keyboard drops into moves. Places the assistant beside the board from 1280px wide and below it on narrower screens. |
| `app/board/ChatPanel.tsx`, `app/board/chat.module.css` | The assistant sidebar: saved conversation, message field (Enter sends, Shift+Enter adds a line), pending status, and retryable errors for each failure `kind`. A successful turn passes its board to `useBoard`. A stale turn reloads the board. On wide screens the panel fills the board's row and scrolls the conversation inside it, so a long history never makes the page taller. A taller page made drags in Firefox and WebKit unreliable. |
| `app/board/BoardColumn.tsx` | Droppable column, stage icon, count, and draggable cards with edit, delete, and move controls. Editing disables dragging for that card. The card tools stay mounted while editing, because unmounting the drag handle makes dnd-kit give the card a button role. |
| `app/board/ColumnControls.tsx` | Inline column renaming and the shared title and details form used to add and edit cards. Titles are required, details are optional. The controls handle cancellation and keyboard focus. |

Cards move and reorder by pointer, keyboard, and touch. Cards with identical titles are distinguished by ID. The integration sequence for persistence and chat is in [the project plan](../docs/PLAN.md).

## Run and verify

Run these commands from `frontend/`.

- Install the locked dependencies with `npm ci`. Start the project container, then run `npm run dev` for the frontend development server. It forwards `/api/` requests to FastAPI on port 8000.
- Run `npm run lint`, `npm run typecheck`, and `npm test`. Vitest runs the reducer, control, board, and chat tests in `tests/unit/` using jsdom. The board and chat tests stub `fetch`.
- `npm run build` exports the site to `out/`. The Docker build copies this directory into the FastAPI runtime.
- Install the browsers with `npx playwright install`, then run `npm run test:e2e` with Docker running. The global setup builds the current source into a separate Compose project, `fieldwork-e2e`, on port 8001 with an empty volume, and removes it afterwards. The app on port 8000 and its data are untouched. The `signed-in.ts` fixture resets the `user` board to the sample cards through the API before each test, so tests run on one worker. Chat history is not reset, so chat tests check the end of the conversation. The container gets `tests/e2e/e2e.env` instead of the root `.env`: a fake API key and an `OPENROUTER_URL` pointing at `fake-model.ts`. The `model` fixture serves that fake on host port 8002, and each test queues the replies it expects. Before reloading, a test should wait until the board region's `aria-busy` is `false`.
- `tests/e2e/board.spec.ts` covers desktop board interactions in Chromium, Firefox, and WebKit: editing, keyboard focus, a failed save, and persistence across reload and sign-in. `tests/e2e/chat.spec.ts` covers reply-only and multi-card turns, persistence after reload and sign-in, failed and stale sends, pending feedback, and keyboard use. `tests/e2e/mobile.spec.ts` covers touch dragging, horizontal scrolling, long text, and the assistant below the board on an emulated Pixel 7. Firefox crashes on `locator.allTextContents()` over the conversation, so check messages one at a time.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
