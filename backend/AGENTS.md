# FastAPI backend

`main.py` exposes the application as `main:app`. The Docker build places the Next.js export in `/app/static/`. FastAPI serves the board at `/` and its assets at their exported paths. Register API routes before the root static mount. `GET /api/health` returns `{"status":"ok"}`.

The Docker image installs the dependencies in `pyproject.toml` using `uv sync --locked`. When changing dependencies, regenerate `uv.lock` with `uv lock` from this directory.

Start the container with the project scripts. From the repository root, run `python -m unittest discover -s backend/tests` against the running service.
