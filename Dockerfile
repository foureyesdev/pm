FROM node:26-trixie-slim AS frontend

WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/tsconfig.json frontend/next.config.mjs ./
COPY frontend/app/ ./app/
RUN npm run build

FROM ghcr.io/astral-sh/uv:python3.14-trixie-slim

WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-cache
COPY backend/*.py ./
COPY --from=frontend /frontend/out/ ./static/

EXPOSE 8000
CMD ["/app/.venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
