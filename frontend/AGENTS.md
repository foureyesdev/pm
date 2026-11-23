# Fieldwork frontend

The Next.js App Router demo checks the session at `/`. Sign in with `user` and `password` to open the "Website launch" board. Reloading keeps the session and restores the five sample columns and twelve cards from React's initial state.

## Where to make a change

| File | Responsibility |
| --- | --- |
| `app/layout.tsx`, `app/page.tsx` | Document metadata, session lookup, sign-in form, workspace header with logout, and board entry point. |
| `app/globals.css`, `app/page.module.css`, `app/board/board.module.css` | Shared palette and bundled DM Sans font, page layout, and board styles respectively. |
| `app/board/seed.ts` | Starting columns and cards in display order. The fixed stage IDs are `backlog`, `ready`, `progress`, `review`, and `done`. |
| `app/board/model.ts` | TypeScript types and pure reducer for renaming columns and adding, deleting, or moving cards. A move identifies the card, destination column, and optional `beforeId`. Omitting the anchor or passing `null` appends the card. |
| `app/board/Board.tsx` | Client entry point. Initializes the reducer, renders the scrollable lanes, and translates pointer and keyboard drops into move actions. |
| `app/board/BoardColumn.tsx` | Droppable column, stage icon, count, and draggable cards with move and delete controls. Stage IDs stay stable when display names change. |
| `app/board/ColumnControls.tsx` | Inline column renaming and new-card form. Titles are required, details are optional. The controls handle cancellation and keyboard focus. |

The demo supports moving and reordering by pointer, keyboard, and touch. Cards with identical titles are distinguished by ID. Editing an existing card's title or details is a planned addition. The integration sequence for sign-in, persistence, and chat is in [the project plan](../docs/PLAN.md).

## Run and verify

Run these commands from `frontend/`.

- Install the locked dependencies with `npm ci`. Start the project container, then run `npm run dev` for the frontend development server. It forwards `/api/` requests to FastAPI on port 8000.
- Run `npm run lint`, `npm run typecheck`, and `npm test`. Vitest runs the reducer and React control tests in `tests/unit/` using jsdom.
- `npm run build` exports the site to `out/`. The Docker build copies this directory into the FastAPI runtime.
- Install the browsers with `npx playwright install`, then run `npm run test:e2e` with Docker running. Playwright uses the packaged app on port 8000 and starts it with `npm start` if needed. If the container is already running, rerun the project start script after source changes to rebuild it before testing.
- `tests/e2e/board.spec.ts` covers desktop board interactions in Chromium, Firefox, and WebKit, including keyboard focus and reload. `tests/e2e/mobile.spec.ts` covers touch dragging, horizontal scrolling, and long text on an emulated Pixel 7.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
