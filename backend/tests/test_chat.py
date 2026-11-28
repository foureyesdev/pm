"""Chat turns against temporary databases with a mocked model. Needs only the standard library."""

import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).parents[1]))

import ai  # noqa: E402
import chat  # noqa: E402
import storage  # noqa: E402


def respond(reply, *operations):
    return json.dumps({"reply": reply, "operations": list(operations)})


def titles(board, column):
    return [card["title"] for card in next(item for item in board["columns"] if item["id"] == column)["cards"]]


class Model:
    """Stands in for ai.complete: records each prompt and returns queued replies or raises errors."""

    def __init__(self, *replies, during=None):
        self.replies = list(replies)
        self.prompts = []
        self.during = during

    def __call__(self, messages, *, tool):
        self.prompts.append({"messages": messages, "tool": tool})
        if self.during:
            self.during()
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


class ChatTests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "fieldwork.sqlite3"
        self.store = storage.Store(self.path)

    def send(self, model, message="Hello", username="a"):
        return chat.send(self.store, username, message, complete=model)

    def assertNothingSaved(self, model, status, kind, message="Hello"):
        before = self.store.board("a")
        with self.assertRaises(chat.ChatError) as caught:
            self.send(model, message)
        self.assertEqual((caught.exception.status, caught.exception.kind), (status, kind))
        self.assertEqual(self.store.board("a"), before)
        self.assertEqual(chat.history(self.store, "a"), [])
        return caught.exception

    def test_reply_only_turn_keeps_the_board_and_saves_both_messages(self):
        before = self.store.board("a")
        result = self.send(Model(respond("  You have 12 cards.  ")), "  How many cards?  ")
        self.assertEqual(result["board"], before)
        self.assertEqual(
            [(item["role"], item["content"]) for item in result["messages"]],
            [("user", "How many cards?"), ("assistant", "You have 12 cards.")],
        )
        self.assertEqual(chat.history(self.store, "a"), result["messages"])

    def test_request_carries_the_board_history_and_question(self):
        model = Model(respond("Added.", {"type": "create", "columnId": "done", "title": "Launch"}), respond("Yes."))
        self.send(model, "Add Launch to Done")
        self.send(model, "Is it there?")
        first, second = model.prompts
        self.assertEqual(first["tool"], chat.RESPOND)
        self.assertEqual(second["messages"][0]["role"], "system")
        board = json.loads(second["messages"][0]["content"].split("Current board as JSON:\n", 1)[1])
        self.assertEqual(set(board), {"title", "description", "columns"})
        self.assertEqual(titles(board, "done")[-1], "Launch")
        self.assertEqual(second["messages"][1:], [
            {"role": "user", "content": "Add Launch to Done"},
            {"role": "assistant", "content": "Added."},
            {"role": "user", "content": "Is it there?"},
        ])
        self.assertEqual(len(first["messages"]), 2)

    def test_each_operation(self):
        board = self.send(Model(respond("Created.", {"type": "create", "columnId": "ready", "title": " Brief ", "details": " Notes "})))["board"]
        created = board["columns"][1]["cards"][-1]
        self.assertEqual((created["title"], created["details"]), ("Brief", "Notes"))
        self.assertEqual(board["revision"], 1)

        board = self.send(Model(respond("Edited.", {"type": "edit", "cardId": "homepage", "title": "Ship homepage", "details": None})))["board"]
        self.assertEqual(board["columns"][2]["cards"][0], {
            "id": "homepage", "title": "Ship homepage", "details": "Bring the approved layout to life on desktop and mobile.",
        })

        board = self.send(Model(respond("Moved.", {"type": "move", "cardId": "journal", "columnId": "ready", "beforeId": "homepage-copy"})))["board"]
        self.assertEqual(titles(board, "ready"), ["Outline the journal", "Write homepage copy", "Prepare project imagery", "Brief"])
        board = self.send(Model(respond("Moved.", {"type": "move", "cardId": "journal", "columnId": "done", "beforeId": None})))["board"]
        self.assertEqual(titles(board, "done")[-1], "Outline the journal")
        self.assertEqual(board["revision"], 4)

    def test_multi_card_batch_applies_in_order_with_one_revision(self):
        board = self.send(Model(respond(
            "Done.",
            {"type": "create", "columnId": "review", "title": "QA pass"},
            {"type": "create", "columnId": "review", "title": "QA pass"},
            {"type": "move", "cardId": "prototype", "columnId": "done"},
            {"type": "edit", "cardId": "sitemap", "details": ""},
        )))["board"]
        self.assertEqual(titles(board, "review"), ["Proofread the studio bio", "QA pass", "QA pass"])
        self.assertEqual(titles(board, "done")[-1], "Review the prototype")
        self.assertEqual(board["columns"][4]["cards"][0]["details"], "")
        self.assertEqual(board["revision"], 1)
        self.assertEqual(storage.Store(self.path).board("a"), board)

    def test_malformed_replies_save_nothing(self):
        replies = [
            "not json",
            json.dumps({"operations": []}),
            json.dumps({"reply": "  ", "operations": []}),
            json.dumps({"reply": "Hi", "operations": {}}),
            respond("Hi", "create"),
            respond("Hi", {"type": "delete", "cardId": "homepage"}),
            respond("Hi", {"type": "create", "title": "No column"}),
            respond("Hi", {"type": "move", "cardId": "homepage", "columnId": 3}),
            respond("Hi", {"type": "edit", "cardId": "homepage"}),
        ]
        for reply in replies:
            with self.subTest(reply=reply):
                self.assertNothingSaved(Model(reply), 502, "reply")

    def test_invalid_second_operation_applies_none(self):
        for second in [
            {"type": "move", "cardId": "missing", "columnId": "done"},
            {"type": "move", "cardId": "homepage", "columnId": "done", "beforeId": "prototype"},
            {"type": "create", "columnId": "archive", "title": "Old"},
            {"type": "edit", "cardId": "homepage", "title": "  "},
        ]:
            with self.subTest(second=second):
                error = self.assertNothingSaved(
                    Model(respond("Done.", {"type": "create", "columnId": "done", "title": "First"}, second)), 502, "reply"
                )
                self.assertIn("could not be applied", str(error))

    def test_stale_board_is_rejected_and_a_retry_succeeds(self):
        def user_moves_a_card():
            self.store.update("a", lambda db, board: storage.move_card(db, board, "journal", "done"))
            model.during = None

        model = Model(respond("Added.", {"type": "create", "columnId": "done", "title": "Launch"}), during=user_moves_a_card)
        with self.assertRaises(chat.ChatError) as caught:
            self.send(model, "Add Launch")
        self.assertEqual((caught.exception.status, caught.exception.kind), (409, "stale"))
        board = self.store.board("a")
        self.assertEqual(titles(board, "done"), ["Define the sitemap", "Approve the wireframes", "Outline the journal"])
        self.assertEqual(chat.history(self.store, "a"), [])

        model.replies.append(respond("Added.", {"type": "create", "columnId": "done", "title": "Launch"}))
        board = self.send(model, "Add Launch")["board"]
        self.assertEqual(titles(board, "done")[-2:], ["Outline the journal", "Launch"])
        self.assertIn("Outline the journal", model.prompts[1]["messages"][0]["content"])

    def test_provider_failures_save_nothing(self):
        for error, status in [
            (ai.AIError("provider", "Rate limit exceeded", 429), 502),
            (ai.AIError("model", "No endpoints found", 404), 502),
            (ai.AIError("configuration", "OPENROUTER_API_KEY is not set"), 503),
        ]:
            with self.subTest(kind=error.kind):
                self.assertIn(str(error), str(self.assertNothingSaved(Model(error), status, error.kind)))

    def test_blank_message_is_rejected_before_calling_the_model(self):
        model = Model()
        with self.assertRaises(storage.Invalid):
            self.send(model, "   ")
        self.assertEqual(model.prompts, [])

    def test_history_survives_reopening_and_is_isolated_per_user(self):
        self.send(Model(respond("First reply.")), "First")
        self.send(Model(respond("Second reply.", {"type": "create", "columnId": "done", "title": "Launch"})), "Second")
        saved = [(item["role"], item["content"]) for item in chat.history(storage.Store(self.path), "a")]
        self.assertEqual(saved, [
            ("user", "First"), ("assistant", "First reply."), ("user", "Second"), ("assistant", "Second reply."),
        ])

        model = Model(respond("Hi B."))
        self.send(model, "Hello from B", username="b")
        self.assertEqual(len(model.prompts[0]["messages"]), 2)
        self.assertNotIn("Launch", model.prompts[0]["messages"][0]["content"])
        self.assertEqual([item["content"] for item in chat.history(self.store, "b")], ["Hello from B", "Hi B."])
        self.assertEqual(len(chat.history(self.store, "a")), 4)
        self.assertEqual(titles(self.store.board("b"), "done"), ["Define the sitemap", "Approve the wireframes"])


if __name__ == "__main__":
    unittest.main()
