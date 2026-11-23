from pathlib import Path
from secrets import token_urlsafe
from typing import Annotated

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Fieldwork")
static_dir = Path(__file__).parent / "static"
sessions: dict[str, str] = {}
SessionCookie = Annotated[str | None, Cookie(alias="fieldwork_session")]


class Credentials(BaseModel):
    username: str
    password: str


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


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
async def home() -> FileResponse:
    return FileResponse(static_dir / "index.html")


# Register API routes above this mount. Missing files use FastAPI's JSON 404.
app.mount("/", StaticFiles(directory=static_dir), name="frontend")
