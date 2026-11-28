"""OpenRouter client tests against a local stub server. They never contact the provider."""

import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parents[1]))

import ai  # noqa: E402

KEY = "sk-or-test-secret"


class Stub(BaseHTTPRequestHandler):
    reply: tuple[int, bytes] = (200, b"{}")
    received: list[dict] = []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        type(self).received.append({"headers": dict(self.headers), "body": body})
        status, payload = type(self).reply
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


def chat(content):
    return json.dumps({"choices": [{"message": {"role": "assistant", "content": content}}]}).encode()


def failure(message):
    return json.dumps({"error": {"code": 0, "message": message}}).encode()


class CompleteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Stub)
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/api/v1/chat/completions"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        Stub.received = []
        patch = mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": KEY})
        patch.start()
        self.addCleanup(patch.stop)

    def ask(self, url=None):
        return ai.complete([{"role": "user", "content": "What is 2+2?"}], url=url or self.url, timeout=5)

    def assertFails(self, kind, status=None, url=None):
        with self.assertLogs("ai", "WARNING") as logs, self.assertRaises(ai.AIError) as caught:
            self.ask(url)
        self.assertEqual(caught.exception.kind, kind)
        self.assertEqual(caught.exception.status, status)
        self.assertNotIn(KEY, str(caught.exception))
        self.assertNotIn(KEY, "\n".join(logs.output))
        return caught.exception

    def test_success_sends_model_messages_and_key(self):
        Stub.reply = (200, chat("  2 + 2 = 4.  "))
        self.assertEqual(self.ask(), "2 + 2 = 4.")
        (request,) = Stub.received
        self.assertEqual(request["headers"]["Authorization"], f"Bearer {KEY}")
        self.assertEqual(request["body"], {
            "model": "nvidia/nemotron-3-ultra-550b-a55b:free",
            "messages": [{"role": "user", "content": "What is 2+2?"}],
        })

    def test_tool_mode_forces_the_call_and_returns_its_arguments(self):
        tool = {"name": "respond", "description": "Reply.", "parameters": {"type": "object"}}
        arguments = json.dumps({"reply": "4", "operations": []})
        call = {"type": "function", "function": {"name": "respond", "arguments": arguments}}
        Stub.reply = (200, json.dumps({"choices": [{"message": {"content": None, "tool_calls": [call]}}]}).encode())
        self.assertEqual(ai.complete([{"role": "user", "content": "2+2?"}], tool=tool, url=self.url, timeout=5), arguments)
        body = Stub.received[0]["body"]
        self.assertEqual(body["tools"], [{"type": "function", "function": tool}])
        self.assertEqual(body["tool_choice"], {"type": "function", "function": {"name": "respond"}})

        Stub.reply = (200, chat("I will not call the tool."))
        with self.assertRaises(ai.AIError) as caught:
            ai.complete([{"role": "user", "content": "2+2?"}], tool=tool, url=self.url, timeout=5)
        self.assertEqual(caught.exception.kind, "provider")

    def test_endpoint_can_be_set_by_environment(self):
        Stub.reply = (200, chat("4"))
        with mock.patch.dict(os.environ, {"OPENROUTER_URL": self.url}):
            self.assertEqual(ai.complete([{"role": "user", "content": "2+2?"}], timeout=5), "4")
        self.assertEqual(len(Stub.received), 1)

    def test_missing_key_is_a_configuration_error_without_a_request(self):
        for value in ["", "   "]:
            with self.subTest(value=value), mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": value}):
                with self.assertRaises(ai.AIError) as caught:
                    self.ask()
                self.assertEqual(caught.exception.kind, "configuration")
        with mock.patch.dict(os.environ, clear=True), self.assertRaises(ai.AIError) as caught:
            self.ask()
        self.assertEqual(caught.exception.kind, "configuration")
        self.assertEqual(Stub.received, [])

    def test_http_errors_are_classified(self):
        cases = [
            (401, "No auth credentials found", "configuration"),
            (402, "Insufficient credits", "configuration"),
            (400, "nvidia/missing is not a valid model ID", "model"),
            (404, "No endpoints found for nvidia/missing", "model"),
            (502, "Model is down", "model"),
            (503, "No available model provider", "model"),
            (400, "Input required", "provider"),
            (403, "Input was flagged by moderation", "provider"),
            (408, "Request timed out", "provider"),
            (429, "Rate limit exceeded: free-models-per-day", "provider"),
            (500, "Internal Server Error", "provider"),
        ]
        for status, message, kind in cases:
            with self.subTest(status=status, message=message):
                Stub.reply = (status, failure(message))
                error = self.assertFails(kind, status)
                self.assertIn(message, str(error))
                self.assertIn(str(status), str(error))

    def test_unreadable_error_body_keeps_the_status(self):
        Stub.reply = (500, b"<html>Bad gateway</html>")
        self.assertIn("Bad gateway", str(self.assertFails("provider", 500)))

    def test_provider_error_inside_a_successful_response(self):
        Stub.reply = (200, failure("Upstream provider overloaded"))
        self.assertIn("Upstream provider overloaded", str(self.assertFails("provider")))

    def test_malformed_and_empty_replies(self):
        for payload in [b"not json", b"{}", json.dumps({"choices": []}).encode(), chat(None), chat("  ")]:
            with self.subTest(payload=payload), self.assertRaises(ai.AIError) as caught:
                Stub.reply = (200, payload)
                self.ask()
            self.assertEqual(caught.exception.kind, "provider")

    def test_unreachable_provider(self):
        self.assertIn("Could not reach OpenRouter", str(self.assertFails("provider", url="http://127.0.0.1:9/")))


if __name__ == "__main__":
    unittest.main()
