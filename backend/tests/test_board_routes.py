"""Run against the local container after starting it with scripts/start.

The tests use the shared `user` board, so each one restores the cards and names it changes.
"""

import json
import unittest
from http.client import HTTPConnection
from http.cookies import SimpleCookie

STAGES = ["backlog", "ready", "progress", "review", "done"]


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


def column(board, column_id):
    return next(item for item in board["columns"] if item["id"] == column_id)


class BoardRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        response, _ = request("POST", "/api/session", {"username": "user", "password": "password"})
        cls.cookie = SimpleCookie(response.getheader("Set-Cookie"))["fieldwork_session"].OutputString(attrs=[])

    def call(self, method, path, body=None, status=200):
        response, data = request(method, path, body, self.cookie)
        self.assertEqual(response.status, status, data)
        return data

    def create(self, column_id, title, details=""):
        board = self.call("POST", "/api/board/cards", {"columnId": column_id, "title": title, "details": details}, 201)
        card = column(board, column_id)["cards"][-1]
        self.addCleanup(request, "DELETE", f"/api/board/cards/{card['id']}", cookie=self.cookie)
        return board, card

    def test_routes_require_sign_in(self):
        routes = [
            ("GET", "/api/board", None),
            ("PATCH", "/api/board/columns/ready", {"name": "Queued"}),
            ("POST", "/api/board/cards", {"columnId": "ready", "title": "Card"}),
            ("PATCH", "/api/board/cards/homepage", {"title": "Card"}),
            ("DELETE", "/api/board/cards/homepage", None),
            ("POST", "/api/board/cards/homepage/move", {"columnId": "done"}),
        ]
        for method, path, body in routes:
            with self.subTest(method=method, path=path):
                for cookie in [None, "fieldwork_session=revoked"]:
                    self.assertEqual(request(method, path, body, cookie)[0].status, 401)

    def test_board_loads_in_stage_order(self):
        board = self.call("GET", "/api/board")
        self.assertEqual(board["title"], "Website launch")
        self.assertIsInstance(board["revision"], int)
        self.assertEqual([item["id"] for item in board["columns"]], STAGES)
        self.assertEqual(self.call("GET", "/api/board"), board)

    def test_rename_column(self):
        original = column(self.call("GET", "/api/board"), "review")["name"]
        self.addCleanup(request, "PATCH", "/api/board/columns/review", {"name": original}, self.cookie)
        board = self.call("PATCH", "/api/board/columns/review", {"name": "  Checking  "})
        self.assertEqual(column(board, "review")["name"], "Checking")
        self.assertEqual(column(self.call("GET", "/api/board"), "review")["name"], "Checking")

    def test_card_lifecycle(self):
        start = self.call("GET", "/api/board")
        backlog = [card["id"] for card in column(start, "backlog")["cards"]]
        _, first = self.create("backlog", "Route test card", " First ")
        board, second = self.create("backlog", "Route test card")
        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(first["details"], "First")
        self.assertEqual(
            [card["id"] for card in column(board, "backlog")["cards"]], [*backlog, first["id"], second["id"]]
        )
        self.assertEqual(board["revision"], start["revision"] + 2)

        board = self.call("POST", f"/api/board/cards/{second['id']}/move", {"columnId": "backlog", "beforeId": first["id"]})
        self.assertEqual([card["id"] for card in column(board, "backlog")["cards"]][-2:], [second["id"], first["id"]])

        board = self.call("PATCH", f"/api/board/cards/{first['id']}", {"title": "Edited route card", "details": "More"})
        self.assertEqual(
            column(board, "backlog")["cards"][-1], {"id": first["id"], "title": "Edited route card", "details": "More"}
        )

        board = self.call("POST", f"/api/board/cards/{first['id']}/move", {"columnId": "done", "beforeId": None})
        self.assertEqual(column(board, "done")["cards"][-1]["id"], first["id"])

        board = self.call("DELETE", f"/api/board/cards/{first['id']}")
        board = self.call("DELETE", f"/api/board/cards/{second['id']}")
        self.assertEqual([card["id"] for card in column(board, "backlog")["cards"]], backlog)
        self.assertEqual(board["revision"], start["revision"] + 7)

    def test_invalid_requests_keep_board(self):
        before = self.call("GET", "/api/board")
        card = column(before, "progress")["cards"][0]["id"]
        other = column(before, "done")["cards"][0]["id"]
        rejected = [
            ("POST", "/api/board/cards", {"columnId": "ready", "title": "  "}, 422),
            ("POST", "/api/board/cards", {"columnId": "missing", "title": "Card"}, 404),
            ("POST", "/api/board/cards", {"columnId": "ready"}, 422),
            ("PATCH", "/api/board/columns/ready", {"name": " "}, 422),
            ("PATCH", "/api/board/columns/missing", {"name": "Name"}, 404),
            ("PATCH", f"/api/board/cards/{card}", {"title": ""}, 422),
            ("PATCH", "/api/board/cards/missing", {"title": "Card"}, 404),
            ("DELETE", "/api/board/cards/missing", None, 404),
            ("POST", "/api/board/cards/missing/move", {"columnId": "done"}, 404),
            ("POST", f"/api/board/cards/{card}/move", {"columnId": "missing"}, 404),
            ("POST", f"/api/board/cards/{card}/move", {"columnId": "progress", "beforeId": other}, 422),
            ("POST", f"/api/board/cards/{card}/move", {"columnId": "progress", "beforeId": card}, 422),
            ("POST", f"/api/board/cards/{card}/move", {"columnId": "done", "beforeId": "missing"}, 422),
        ]
        for method, path, body, status in rejected:
            with self.subTest(method=method, path=path, body=body):
                self.call(method, path, body, status)
        self.assertEqual(self.call("GET", "/api/board"), before)


if __name__ == "__main__":
    unittest.main()
