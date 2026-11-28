"""Run against the local container after starting it with scripts/start.

These requests never reach the model: the turn logic is covered with a mocked model in test_chat.py.
"""

import json
import unittest
from http.client import HTTPConnection
from http.cookies import SimpleCookie


def request(method, path, body=None, cookie=None):
    connection = HTTPConnection("127.0.0.1", 8000, timeout=5)
    try:
        headers = {"Cookie": cookie} if cookie else {}
        if body is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(body)
        connection.request(method, path, body, headers)
        response = connection.getresponse()
        data = response.read()
        return response, json.loads(data) if data else None
    finally:
        connection.close()


def sign_in():
    response, _ = request("POST", "/api/session", {"username": "user", "password": "password"})
    return SimpleCookie(response.getheader("Set-Cookie"))["fieldwork_session"].OutputString(attrs=[])


class ChatRouteTests(unittest.TestCase):
    def test_routes_require_sign_in(self):
        for method, body in [("GET", None), ("POST", {"message": "Hello"})]:
            with self.subTest(method=method):
                self.assertEqual(request(method, "/api/chat", body)[0].status, 401)

    def test_invalid_messages_are_rejected_without_saving(self):
        cookie = sign_in()
        before = request("GET", "/api/chat", cookie=cookie)[1]
        for body in [{"message": "   "}, {}]:
            with self.subTest(body=body):
                self.assertEqual(request("POST", "/api/chat", body, cookie)[0].status, 422)
        self.assertEqual(request("GET", "/api/chat", cookie=cookie)[1], before)

    def test_history_is_the_same_after_logout_and_sign_in(self):
        cookie = sign_in()
        response, history = request("GET", "/api/chat", cookie=cookie)
        self.assertEqual(response.status, 200)
        self.assertIsInstance(history["messages"], list)
        self.assertEqual(request("DELETE", "/api/session", cookie=cookie)[0].status, 204)
        self.assertEqual(request("GET", "/api/chat", cookie=cookie)[0].status, 401)
        self.assertEqual(request("GET", "/api/chat", cookie=sign_in())[1], history)


if __name__ == "__main__":
    unittest.main()
