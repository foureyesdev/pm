import json
import unittest
from http.client import HTTPConnection
from http.cookies import SimpleCookie


class SessionTests(unittest.TestCase):
    def request(self, method, *, credentials=None, cookie=None):
        connection = HTTPConnection("127.0.0.1", 8000, timeout=5)
        self.addCleanup(connection.close)
        headers = {}
        if cookie:
            headers["Cookie"] = cookie
        body = None
        if credentials:
            headers["Content-Type"] = "application/json"
            body = json.dumps(credentials)
        connection.request(method, "/api/session", body, headers)
        return connection.getresponse()

    def test_anonymous_lookup(self):
        self.assertEqual(self.request("GET").status, 401)

    def test_incorrect_credentials(self):
        for username, password in [("user", "wrong"), ("wrong", "password")]:
            with self.subTest(username=username):
                response = self.request("POST", credentials={"username": username, "password": password})
                self.assertEqual(response.status, 401)
                self.assertIsNone(response.getheader("Set-Cookie"))

    def test_session_lifecycle(self):
        login = self.request("POST", credentials={"username": "user", "password": "password"})
        self.assertEqual(login.status, 200)
        self.assertEqual(json.load(login), {"username": "user"})
        token = SimpleCookie(login.getheader("Set-Cookie"))["fieldwork_session"]
        self.assertTrue(token["httponly"])
        self.assertEqual(token["samesite"].lower(), "strict")
        cookie = token.OutputString(attrs=[])

        lookup = self.request("GET", cookie=cookie)
        self.assertEqual(lookup.status, 200)
        self.assertEqual(json.load(lookup), {"username": "user"})
        self.assertEqual(lookup.getheader("Cache-Control"), "no-store")

        logout = self.request("DELETE", cookie=cookie)
        self.assertEqual(logout.status, 204)
        cleared = SimpleCookie(logout.getheader("Set-Cookie"))["fieldwork_session"]
        self.assertEqual(cleared["max-age"], "0")
        self.assertEqual(self.request("GET", cookie=cookie).status, 401)
