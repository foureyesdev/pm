# Project Management MVP implementation plan

## Part 1. Review the starting point and agree on the plan

- [x] Compare the root requirements with the frontend source and existing tests. The demo supports renaming columns and adding, deleting, and moving cards. Editing an existing card is scheduled for Part 7.
- [x] Document the frontend entry points, state, interactions, and test commands in `frontend/AGENTS.md`.
- [x] Incorporate the storage decisions. Document the relational schema in JSON, store columns and cards in separate SQLite tables, and retain each user's conversation across reload and logout.
- [x] **Verify** the frontend guide against the source and package scripts. Trace the MVP requirements to the implementation steps and acceptance checks below.
- [x] **Acceptance:** The user reviews and approves this plan before Part 2 begins.

## Part 2. Run a FastAPI scaffold in Docker

- [x] Set up a Python project under `backend/` with FastAPI and uv. Resolve current compatible dependencies and commit the lockfile. Describe the backend entry point in `backend/AGENTS.md`.
- [x] Build one local application container. Serve a small HTML page at `/` that fetches `/api/health` and displays the response. Keep API paths distinct from static routes.
- [x] Add start and stop scripts under `scripts/` for Windows PowerShell and for macOS/Linux shell. Have them use the same container configuration, local port, and persistent data volume. Exclude the root `.env` from the image.
- [x] **Test** the health endpoint and page response. Build and start the container, open the page, verify the fetched status, stop it, and start it again. Exercise the scripts on their supported platforms and record any platform still unverified.
- [x] **Acceptance:** From a fresh checkout with Docker available, the start script brings up a page that displays a successful API response. The stop script releases the port and preserves the data volume.

Verified with Windows PowerShell and Ubuntu under WSL using the Windows Docker CLI. Chromium displayed the fetched status, all three HTTP tests passed, stopping released port 8000, and a test file survived container recreation in the named volume. Native macOS verification is pending.

## Part 3. Serve the existing Next.js board from FastAPI

- [x] Configure a static Next.js export. Use a Node build stage to install the locked frontend dependencies and build the assets. Copy the export into the FastAPI runtime image and replace the scaffold page at `/`.
- [x] Serve the exported HTML, JavaScript, CSS, image, and font files with their expected paths. Keep the health route reachable and unknown API routes returning an API 404.
- [x] Point Playwright at the FastAPI-served build. Keep the current demo seed and reset-on-reload expectation for this milestone.
- [x] **Test** lint, type checking, Vitest, and the existing desktop and mobile Playwright suites. Check asset loading and the health route from the running container.
- [x] **Acceptance:** The container serves an interactive five-column, twelve-card board at `/`. Renaming, adding, deleting, and pointer, keyboard, and touch moves pass through the packaged site.

Verified against the running Docker image. Lint, type checking, 18 unit tests, three HTTP tests, and 21 browser tests passed. Chromium loaded the exported HTML, JavaScript, CSS, PNG, and WOFF2 assets without request or page errors. Firefox ran on the host after its sandboxed browser crashed opening a blank page.

## Part 4. Add sign-in and logout

- [x] Add FastAPI session creation, session lookup, and logout. Accept the MVP credentials `user` and `password` on the server and identify the signed-in user with an HTTP-only session cookie.
- [x] Have the frontend check the session before showing the board at `/`. Provide a labeled sign-in form, invalid-credentials feedback, and a logout control. Use the same session check for protected API routes in later parts.
- [x] **Test** valid and invalid credentials, anonymous session lookup, reload while signed in, logout, and attempted reuse of a logged-out session. Update board browser tests to sign in and add a test starting with a fresh browser session.
- [x] **Acceptance:** A fresh visit shows sign-in. Valid credentials open the board, a reload keeps the user signed in, and logout returns the user to sign-in and invalidates the session.

Verified with the Docker app. All 18 unit tests, six HTTP tests, and 25 browser cases passed. The fresh-session flow covers invalid credentials, sign-in, reload, and logout on all four browser configurations. The API test confirms the server rejects a revoked cookie. Sessions last for the lifetime of the running backend process.

## Part 5. Design the relational SQLite schema

- [x] Write `docs/schema.json` describing tables, fields, primary and foreign keys, ordering, and uniqueness. Propose users, one board per user, separate columns and cards tables, and ordered chat messages associated with the owning board.
- [x] In `docs/database.md`, explain how fixed stage IDs can recur across boards, how renamed columns retain their identity, and how card positions are updated when moving within or between columns. Describe first-use seeding, the database file's volume, and the lifetime of chat history after logout.
- [x] **Test the design** by parsing the JSON and tracing a two-user example. Walk through reordering two same-title cards by ID, moving one to an empty column, and retrieving the correct conversation after signing in again.
- [x] **Acceptance:** The documented relationships and constraints support those examples. Obtain user sign-off on the schema and database approach before implementing them in Part 6.

Validated the [schema](schema.json) and [two-user walkthrough](database.md) in a temporary SQLite database. All five tables were created from the JSON definitions. Seven invalid writes were rejected. Reopening the file preserved each user's column names, card order, revision, and ordered chat history. Foreign-key and integrity checks passed. The user signed off on the schema and database approach on 2026-11-27.

## Part 6. Implement storage and authenticated board routes

- [x] Create the SQLite database on first run using the approved schema. Enable foreign key enforcement and initialize each user's board with the five stages and sample cards exactly once.
- [x] Provide authenticated routes to load the ordered board, rename a column, and create, edit, delete, move, or reorder cards. Derive ownership from the session. Keep the move contract consistent with the frontend's destination column and optional insertion anchor.
- [x] Validate nonblank titles and column names, IDs, ownership, and the destination. Apply each mutation and its ordering changes in one transaction. Share this logic with the later AI integration.
- [x] **Test** storage and routes against temporary databases. Cover fresh and repeat initialization, all mutations, duplicate titles, empty destinations, invalid IDs or anchors, unauthorized requests, and isolation between two fixture users. Reopen the database and verify saved contents and order.
- [x] **Acceptance:** A signed-in user can retrieve and change only their board. Failed moves leave the original order intact, and restarting the container preserves successful changes.

Verified with the Docker app and Python 3.14 under WSL. All 22 backend tests passed: 11 storage tests against temporary databases, including two-user isolation and reopening the file, and 5 route tests against the container. Route tests cover sign-in on every route, 13 rejected requests that leave the board and revision unchanged, and a create, move, edit, and delete lifecycle. Because the MVP has a single login, isolation between two users is tested at the storage layer. A renamed column and a reorder survived stopping and recreating the container. The change was then reverted. The server assigns new card IDs, so Part 7 replaces the client's `crypto.randomUUID()` with the ID from the saved board.

## Part 7. Connect the frontend and add card editing

- [x] Load the signed-in user's board from the API. Wire the existing controls and drag handlers to the Part 6 routes. Replace the demo reset tooltip and show loading or save errors where the user can act on them.
- [x] Add an accessible editor for a card's title and details. Support saving and cancelling, preserve the card ID and position, and use the server's saved state to keep the board consistent after writes or failures.
- [x] **Test** editor validation, cancel, save, and failed writes. Give browser tests isolated starting data and replace reset-on-reload assertions with persistence checks. Exercise rename, create, edit, reorder, cross-column move, and delete through the packaged app, retaining keyboard and touch coverage.
- [x] **Acceptance:** After reload and after logout followed by sign-in, the board shows the saved names, card contents, and ordering. Cancelled edits and failed writes leave the board consistent with the database.

Verified with lint, type checking, 24 unit tests, 22 backend tests, and 31 browser cases across Chromium, Firefox, WebKit, and the emulated Pixel 7. Browser tests run against a separate `fieldwork-e2e` Compose project on port 8001 with an empty volume. Each test starts from the sample board, so the app on port 8000 keeps its data. A failed save restores the server's order and shows a dismissible error. A failed load offers a retry, and an expired session returns to sign-in. No reset tooltip remained in the source or its history, so that item needed no change.

## Part 8. Verify backend connectivity to OpenRouter

- [x] Configure the backend to read `OPENROUTER_API_KEY` from the root `.env` at runtime and call `nvidia/nemotron-3-ultra-550b-a55b:free`. Keep the key in the backend and omit it from logs.
- [x] **Test** the client with a mocked successful response and provider errors. Run a separate live check from the container asking "What is 2+2?" and record the result. Keep routine tests independent of provider availability.
- [x] **Acceptance:** The configured model returns an answer equivalent to four in the live check. A failure is reported with enough detail to distinguish configuration, model availability, and provider errors.

Verified on 2026-11-27. The live check in the container replied "2 + 2 = 4". All 29 backend tests passed, including 7 client tests against a local stub server. They cover the request shape, a missing key, eleven HTTP error statuses mapped to configuration, model, or provider errors, a provider error inside a 200 response, malformed and empty replies, and an unreachable host. Every error and log line was checked for the key. The key reached the running container, but it was absent from the image's environment and build history and from the container logs.

## Part 9. Apply structured AI replies and persist chat

- [x] Add authenticated routes to read conversation history and send a message. For each send, load the current board and ordered history for the signed-in user. Send the board as JSON with the prior conversation and the new question.
- [x] Request Structured Outputs with an assistant reply and an optional batch of card creates, edits, or moves. Verify that the configured model and provider support the schema with a live example before relying on it.
- [x] Validate the whole batch against the user's board and apply it through the Part 6 mutation logic. If the board changed while awaiting the model, reject the stale update and allow a retry. Commit the successful chat turn and its board changes together.
- [x] **Test** with a mocked provider for a reply-only question, each operation, a multi-card request, a malformed reply, an invalid second operation, a stale board, and provider failure. Inspect the outgoing request for board and history context. Verify ordered history after reload and logout/sign-in, and isolation with a second fixture user.
- [x] **Acceptance:** A reply-only turn preserves the board. A valid batch persists every requested change, and an invalid batch applies none. The next turn receives the saved conversation and current board.

Verified on 2026-11-27. A live probe showed that the `:free` endpoint has no `response_format` support: with `require_parameters`, OpenRouter answered 404, "No endpoints found that can handle the requested parameters". Without that flag, the schema was silently dropped. A forced tool call with the same schema is supported, so replies use one, and the server validates every reply. All 43 backend tests passed, including 10 chat tests with a mocked model against temporary databases and 3 chat route tests against the container.

Live turns through `POST /api/chat` on the container:

- A reply-only question ("There are 2 cards in the Done column.") left the board and its revision unchanged.
- A request to add a card to Review and move "Define the sitemap" to the top of Backlog applied both changes under a single revision.
- After logout and sign-in, the history returned in order.
- A follow-up question correctly named the card just added.

The board changes and the test messages were then removed.

## Part 10. Deliver the AI chat sidebar

- [x] Add a sidebar to the signed-in board with conversation history, a message field, a send control, and pending and error feedback. Use the existing palette, keyboard focus conventions, and a layout that leaves the board usable on phones.
- [x] Load saved messages when the board opens. After a successful turn, show the reply and refresh the board automatically when cards changed. Clear the previous session's visible board and chat on logout.
- [x] **Test** the packaged app end to end with a deterministic provider response. Send a reply-only question and a multi-card request, verify the visible changes without reloading, then reload and sign in again after logout. Exercise a failed send, keyboard navigation, and the mobile layout. Repeat one successful chat-driven change with the live model.
- [x] **Acceptance:** A signed-in user can converse and see requested card changes immediately. After reload, logout/sign-in, or a container restart using the same volume, the conversation and board return in their saved order.

Verified on 2026-11-28 with lint, type checking, 35 unit tests, 44 backend tests, and 41 browser cases across Chromium, Firefox, WebKit, and the emulated Pixel 7. Browser tests use a fake model served from the host, so they never call OpenRouter. The chat spec covers:

- a reply-only question and a three-operation request, visible without a reload
- persistence after reload, logout, and sign-in
- a rate-limited send, a stale turn that refreshes the board, and a retry
- pending feedback, multi-line messages, and keyboard use

The first full run exposed drag failures in Firefox and WebKit. With a long history, the sidebar made the page taller, and Firefox scrolled the page when a drag began. The panel now fills the board's row instead. The next full run passed.

Live check on the :8000 app: a request through the sidebar added a card to Done, which appeared without a reload. After the container was recreated on the same volume, the card and the conversation returned. The test card and messages were then removed.
