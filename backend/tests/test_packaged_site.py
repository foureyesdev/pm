"""Run against the local container after starting it with scripts/start."""

import json
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen


class PackagedSiteTests(unittest.TestCase):
    base_url = "http://127.0.0.1:8000"

    def test_health_response(self):
        with urlopen(f"{self.base_url}/api/health", timeout=5) as response:
            self.assertEqual(response.headers.get_content_type(), "application/json")
            self.assertEqual(json.load(response), {"status": "ok"})

    def test_home_page(self):
        with urlopen(self.base_url, timeout=5) as response:
            self.assertEqual(response.headers.get_content_type(), "text/html")
            self.assertIn("<h1>Website launch</h1>", response.read().decode())

    def test_unknown_api_route(self):
        with self.assertRaises(HTTPError) as error:
            urlopen(f"{self.base_url}/api/missing", timeout=5)
        with error.exception as response:
            self.assertEqual(response.code, 404)
            self.assertEqual(response.headers.get_content_type(), "application/json")
