from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Fieldwork")
static_dir = Path(__file__).parent / "static"


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
async def home() -> FileResponse:
    return FileResponse(static_dir / "index.html")


# Register API routes above this mount. Missing files use FastAPI's JSON 404.
app.mount("/", StaticFiles(directory=static_dir), name="frontend")
