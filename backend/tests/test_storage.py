"""Storage tests against temporary SQLite databases. Needs only the standard library."""

import sqlite3
import sys
import unittest
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).parents[1]))

import storage  # noqa: E402


def card_ids(board, column):
    return [card["id"] for card in next(item for item in board["columns"] if item["id"] == column)["cards"]]


class StorageTests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "fieldwork.sqlite3"
        self.store = storage.Store(self.path)

    def apply(self, operation, *args, username="a"):
        return self.store.update(username, lambda db, board: operation(db, board, *args))

    def positions(self, username="a"):
        """Return {column: [positions in order]} straight from the cards table."""
        with closing(sqlite3.connect(self.path)) as db:
            rows = db.execute(
                "SELECT column_id, position FROM cards JOIN boards ON boards.id = cards.board_id"
                " JOIN users ON users.id = boards.user_id WHERE username = ? ORDER BY column_id, position",
                (username,),
            )
            result = {}
            for column, position in rows:
                result.setdefault(column, []).append(position)
            return result

    def assertCompact(self, username="a"):
        for column, positions in self.positions(username).items():
            self.assertEqual(positions, list(range(len(positions))), column)

    def assertRejected(self, error, operation, *args):
        before = self.store.board("a")
        with self.assertRaises(error):
            self.apply(operation, *args)
        self.assertEqual(self.store.board("a"), before)

    def test_first_load_seeds_once(self):
        board = self.store.board("a")
        self.assertEqual(board["title"], "Website launch")
        self.assertEqual(board["revision"], 0)
        self.assertEqual([column["id"] for column in board["columns"]], list(storage.STAGES))
        self.assertEqual(
            [column["name"] for column in board["columns"]], ["Backlog", "Ready", "In progress", "Review", "Done"]
        )
        self.assertEqual(card_ids(board, "backlog"), ["content-audit", "art-direction", "journal"])
        self.assertEqual(sum(len(column["cards"]) for column in board["columns"]), 12)

        self.assertEqual(self.store.board("a"), board)
        self.assertEqual(storage.Store(self.path).board("a"), board)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM boards").fetchone(), (1,))
            self.assertEqual(db.execute("SELECT count(*) FROM cards").fetchone(), (12,))
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone(), ("ok",))

    def test_existing_board_is_not_reseeded(self):
        self.apply(storage.move_card, "prototype", "done")
        self.apply(storage.move_card, "studio-bio", "done")
        board = storage.Store(self.path).board("a")
        self.assertEqual(card_ids(board, "review"), [])
        self.assertEqual(sum(len(column["cards"]) for column in board["columns"]), 12)

    def test_rename_column(self):
        board = self.apply(storage.rename_column, "ready", "  Queued  ")
        self.assertEqual(board["columns"][1]["name"], "Queued")
        self.assertEqual(card_ids(board, "ready"), ["homepage-copy", "project-images"])
        self.assertEqual(board["revision"], 1)
        self.assertRejected(storage.Invalid, storage.rename_column, "ready", "   ")
        self.assertRejected(storage.NotFound, storage.rename_column, "missing", "Name")

    def test_create_cards_with_duplicate_titles(self):
        self.apply(storage.create_card, "done", "  Launch  ", "  Ship it  ")
        board = self.apply(storage.create_card, "done", "Launch")
        cards = board["columns"][4]["cards"]
        self.assertEqual([card["title"] for card in cards], ["Define the sitemap", "Approve the wireframes", "Launch", "Launch"])
        self.assertEqual([card["details"] for card in cards[2:]], ["Ship it", ""])
        self.assertNotEqual(cards[2]["id"], cards[3]["id"])
        self.assertEqual(board["revision"], 2)
        self.assertCompact()
        self.assertRejected(storage.Invalid, storage.create_card, "done", " ")
        self.assertRejected(storage.NotFound, storage.create_card, "missing", "Title")

    def test_edit_card(self):
        board = self.apply(storage.edit_card, "homepage", " New title ", " New details ")
        self.assertEqual(
            board["columns"][2]["cards"][0], {"id": "homepage", "title": "New title", "details": "New details"}
        )
        board = self.apply(storage.edit_card, "homepage", None, "")
        self.assertEqual(board["columns"][2]["cards"][0], {"id": "homepage", "title": "New title", "details": ""})
        self.assertEqual(card_ids(board, "progress"), ["homepage", "case-studies", "mobile-nav"])
        self.assertRejected(storage.Invalid, storage.edit_card, "homepage", "  ", None)
        self.assertRejected(storage.NotFound, storage.edit_card, "missing", "Title", None)

    def test_delete_card_compacts_positions(self):
        board = self.apply(storage.delete_card, "case-studies")
        self.assertEqual(card_ids(board, "progress"), ["homepage", "mobile-nav"])
        self.assertCompact()
        self.assertRejected(storage.NotFound, storage.delete_card, "case-studies")

    def test_reorder_within_column(self):
        board = self.apply(storage.move_card, "mobile-nav", "progress", "homepage")
        self.assertEqual(card_ids(board, "progress"), ["mobile-nav", "homepage", "case-studies"])
        board = self.apply(storage.move_card, "mobile-nav", "progress", None)
        self.assertEqual(card_ids(board, "progress"), ["homepage", "case-studies", "mobile-nav"])
        self.assertCompact()

    def test_move_between_columns_and_into_empty_column(self):
        board = self.apply(storage.move_card, "prototype", "ready", "project-images")
        self.assertEqual(card_ids(board, "ready"), ["homepage-copy", "prototype", "project-images"])
        board = self.apply(storage.move_card, "studio-bio", "ready")
        self.assertEqual(card_ids(board, "review"), [])
        board = self.apply(storage.move_card, "homepage-copy", "review")
        self.assertEqual(card_ids(board, "review"), ["homepage-copy"])
        self.assertEqual(card_ids(board, "ready"), ["prototype", "project-images", "studio-bio"])
        self.assertEqual(board["revision"], 3)
        self.assertCompact()

    def test_failed_moves_keep_order(self):
        self.assertRejected(storage.NotFound, storage.move_card, "missing", "done", None)
        self.assertRejected(storage.NotFound, storage.move_card, "homepage", "missing", None)
        self.assertRejected(storage.Invalid, storage.move_card, "homepage", "done", "missing")
        self.assertRejected(storage.Invalid, storage.move_card, "homepage", "done", "prototype")
        self.assertRejected(storage.Invalid, storage.move_card, "homepage", "progress", "homepage")
        self.assertEqual(self.store.board("a")["revision"], 0)

    def test_users_are_isolated(self):
        self.apply(storage.rename_column, "ready", "Queued")
        self.apply(storage.create_card, "ready", "Review copy")
        self.apply(storage.move_card, "project-images", "ready", "homepage-copy")
        self.apply(storage.delete_card, "journal")
        fresh = self.store.board("b")
        self.assertEqual(fresh, storage.Store(self.path).board("c"))
        self.assertEqual(fresh["revision"], 0)
        self.assertEqual(fresh["columns"][1]["name"], "Ready")
        self.assertEqual(card_ids(fresh, "ready"), ["homepage-copy", "project-images"])
        self.assertEqual(card_ids(fresh, "backlog"), ["content-audit", "art-direction", "journal"])

        self.apply(storage.move_card, "homepage-copy", "done", username="b")
        changed = self.store.board("a")
        self.assertEqual(card_ids(changed, "ready")[:2], ["project-images", "homepage-copy"])
        self.assertCompact("a")
        self.assertCompact("b")

    def test_reopen_preserves_contents_and_order(self):
        self.apply(storage.rename_column, "review", "Checking")
        self.apply(storage.create_card, "review", "Final pass", "Links and spelling")
        self.apply(storage.move_card, "studio-bio", "review", "prototype")
        saved = self.store.board("a")
        self.assertEqual(storage.Store(self.path).board("a"), saved)
        self.assertEqual(saved["revision"], 3)


if __name__ == "__main__":
    unittest.main()
