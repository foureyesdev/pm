# FastAPI backend

`main.py` exposes the application as `main:app`. The root route serves `static/index.html`, which fetches `GET /api/health` and displays the returned status. The health endpoint returns `{"status":"ok"}`.

The Docker image installs the dependencies in `pyproject.toml` using `uv sync --locked`. When changing dependencies, regenerate `uv.lock` with `uv lock` from this directory.

Start the container with the project scripts. From the repository root, run `python -m unittest discover -s backend/tests` against the running service.
