from pathlib import Path
from secrets import token_urlsafe
from typing import Annotated

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

import chat
import storage

app = FastAPI(title="Fieldwork")
static_dir = Path(__file__).parent / "static"
store = storage.Store("/data/fieldwork.sqlite3")
sessions: dict[str, str] = {}
SessionCookie = Annotated[str | None, Cookie(alias="fieldwork_session")]


class Credentials(BaseModel):
    username: str
    password: str


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel)


class ColumnRename(BaseModel):
    name: str


class CardCreate(CamelModel):
    column_id: str
    title: str
    details: str = ""


class CardEdit(BaseModel):
    title: str | None = None
    details: str | None = None


class CardMove(CamelModel):
    column_id: str
    before_id: str | None = None


class ChatMessage(BaseModel):
    message: str


async def current_user(session: SessionCookie = None) -> str:
    username = sessions.get(session) if session else None
    if username is None:
        raise HTTPException(401, "Sign in required", headers={"Cache-Control": "no-store"})
    return username


@app.get("/api/session")
async def get_session(response: Response, username: Annotated[str, Depends(current_user)]) -> dict[str, str]:
    response.headers["Cache-Control"] = "no-store"
    return {"username": username}


@app.post("/api/session")
async def sign_in(credentials: Credentials, response: Response, session: SessionCookie = None) -> dict[str, str]:
    if credentials.username != "user" or credentials.password != "password":
        raise HTTPException(401, "Incorrect username or password")
    if session is not None:
        sessions.pop(session, None)
    token = token_urlsafe(32)
    sessions[token] = credentials.username
    response.set_cookie("fieldwork_session", token, httponly=True, samesite="strict")
    response.headers["Cache-Control"] = "no-store"
    return {"username": credentials.username}


@app.delete("/api/session", status_code=204)
async def sign_out(session: SessionCookie = None) -> Response:
    if session is not None:
        sessions.pop(session, None)
    response = Response(status_code=204)
    response.delete_cookie("fieldwork_session", httponly=True, samesite="strict")
    return response


User = Annotated[str, Depends(current_user)]


@app.exception_handler(storage.NotFound)
async def not_found(request: Request, error: storage.NotFound) -> JSONResponse:
    return JSONResponse({"detail": str(error)}, status_code=404)


@app.exception_handler(storage.Invalid)
async def invalid(request: Request, error: storage.Invalid) -> JSONResponse:
    return JSONResponse({"detail": str(error)}, status_code=422)


# Board routes are sync so SQLite calls run in the threadpool. Each returns the saved board.
@app.get("/api/board")
def get_board(username: User) -> dict:
    return store.board(username)


@app.patch("/api/board/columns/{column_id}")
def rename_column(column_id: str, body: ColumnRename, username: User) -> dict:
    return store.update(username, lambda db, board: storage.rename_column(db, board, column_id, body.name))


@app.post("/api/board/cards", status_code=201)
def create_card(body: CardCreate, username: User) -> dict:
    return store.update(
        username, lambda db, board: storage.create_card(db, board, body.column_id, body.title, body.details)
    )


@app.patch("/api/board/cards/{card_id}")
def edit_card(card_id: str, body: CardEdit, username: User) -> dict:
    return store.update(username, lambda db, board: storage.edit_card(db, board, card_id, body.title, body.details))


@app.delete("/api/board/cards/{card_id}")
def delete_card(card_id: str, username: User) -> dict:
    return store.update(username, lambda db, board: storage.delete_card(db, board, card_id))


@app.post("/api/board/cards/{card_id}/move")
def move_card(card_id: str, body: CardMove, username: User) -> dict:
    return store.update(
        username, lambda db, board: storage.move_card(db, board, card_id, body.column_id, body.before_id)
    )


@app.exception_handler(chat.ChatError)
async def chat_failed(request: Request, error: chat.ChatError) -> JSONResponse:
    return JSONResponse({"detail": str(error), "kind": error.kind}, status_code=error.status)


@app.get("/api/chat")
def get_chat(username: User) -> dict:
    return {"messages": chat.history(store, username)}


@app.post("/api/chat")
def send_chat(body: ChatMessage, username: User) -> dict:
    return chat.send(store, username, body.message)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
async def home() -> FileResponse:
    return FileResponse(static_dir / "index.html")


# Register API routes above this mount. Missing files use FastAPI's JSON 404.
app.mount("/", StaticFiles(directory=static_dir), name="frontend")
