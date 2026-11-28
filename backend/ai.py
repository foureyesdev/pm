"""OpenRouter chat completions client.

The API key comes from OPENROUTER_API_KEY, which Compose loads from the root .env at runtime.
It is sent only in the Authorization header and never appears in errors or logs.

Live check from the running container:
    docker compose exec app /app/.venv/bin/python ai.py
"""

import json
import logging
import os
import sys
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"

logger = logging.getLogger(__name__)

type Kind = Literal["configuration", "model", "provider"]


class AIError(Exception):
    """A failed completion. `kind` says whether to fix the setup, the model choice, or wait for the provider."""

    def __init__(self, kind: Kind, message: str, status: int | None = None):
        super().__init__(message)
        self.kind = kind
        self.status = status


def classify(status: int, message: str) -> Kind:
    """Map an OpenRouter HTTP error to the part of the system that needs attention."""
    if status in (401, 402):
        return "configuration"  # rejected API key or no credits on the account
    if status in (404, 502, 503) or (status == 400 and "model" in message.lower()):
        return "model"  # unknown model ID, model down, or no provider serving it
    return "provider"  # rate limits, timeouts, moderation, and other provider failures


def complete(messages: list[dict], *, tool: dict | None = None, url: str = OPENROUTER_URL, timeout: float = 120) -> str:
    """Send chat messages to the configured model and return the reply text.

    With a tool ({name, description, parameters}), the model must call it and the call's JSON
    arguments are returned instead. The free endpoint has no response_format support, so a
    forced tool call is how replies follow a schema.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise AIError("configuration", "OPENROUTER_API_KEY is not set")

    payload: dict = {"model": MODEL, "messages": messages}
    if tool:
        payload["tools"] = [{"type": "function", "function": tool}]
        payload["tool_choice"] = {"type": "function", "function": {"name": tool["name"]}}
    request = Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            body = json.load(response)
    except HTTPError as error:
        with error:
            message = error_message(error.read()) or error.reason
        kind = classify(error.code, message)
        logger.warning("OpenRouter %s error %s: %s", kind, error.code, message)
        raise AIError(kind, f"OpenRouter returned {error.code}: {message}", error.code) from None
    except (URLError, TimeoutError) as error:
        reason = getattr(error, "reason", error)
        logger.warning("OpenRouter unreachable: %s", reason)
        raise AIError("provider", f"Could not reach OpenRouter: {reason}") from None
    except json.JSONDecodeError:
        raise AIError("provider", "OpenRouter returned a response that is not JSON") from None

    # OpenRouter can report a provider failure inside a 200 response.
    if "error" in body:
        message = body["error"].get("message", "unknown error")
        logger.warning("OpenRouter provider error in response: %s", message)
        raise AIError("provider", f"The model provider failed: {message}")
    try:
        message = body["choices"][0]["message"]
        content = message["tool_calls"][0]["function"]["arguments"] if tool else message["content"]
    except (KeyError, IndexError, TypeError):
        raise AIError("provider", "OpenRouter returned no reply message") from None
    if not content or not content.strip():
        raise AIError("provider", "The model returned an empty reply")
    return content.strip()


def error_message(raw: bytes) -> str:
    try:
        return json.loads(raw)["error"]["message"]
    except (ValueError, KeyError, TypeError):
        return raw.decode(errors="replace").strip()[:200]


if __name__ == "__main__":
    print(f"Asking {MODEL}: What is 2+2?")
    try:
        print("Reply:", complete([{"role": "user", "content": "What is 2+2?"}]))
    except AIError as error:
        print(f"Failed ({error.kind} error): {error}")
        sys.exit(1)
