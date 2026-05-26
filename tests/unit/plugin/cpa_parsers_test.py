#!/usr/bin/env python3
"""Unit tests for CPA plugin parser functions."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import unittest

_plugin_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "resources", "plugins", "cpa-usage-plugin.py")
_spec = importlib.util.spec_from_file_location("cpa_usage_plugin", _plugin_path)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

extract_email = _mod.extract_email
parse_antigravity_models = _mod.parse_antigravity_models
parse_claude = _mod.parse_claude
parse_codex = _mod.parse_codex
parse_gemini_buckets = _mod.parse_gemini_buckets
parse_kimi = _mod.parse_kimi


class TestExtractEmail(unittest.TestCase):
    def test_claude_email(self):
        self.assertEqual(extract_email("claude-user@example.com.json"), "user@example.com")

    def test_codex_email(self):
        self.assertEqual(extract_email("codex-user@example.com-plus.json"), "user@example.com")

    def test_codex_team_hex(self):
        self.assertEqual(extract_email("codex-user@example.com-teama1b2c3.json"), "user@example.com")

    def test_codex_hex_prefix(self):
        self.assertEqual(extract_email("codex-251bae8c-user@example.com-plus.json"), "user@example.com")

    def test_gemini_email(self):
        self.assertEqual(extract_email("gemini-user@example.com.json"), "user@example.com")

    def test_no_extension(self):
        self.assertEqual(extract_email("claude-user@example.com"), "user@example.com")

    def test_path_prefix(self):
        self.assertEqual(extract_email("/some/path/claude-user@example.com.json"), "user@example.com")


class TestParseClaude(unittest.TestCase):
    def test_normal(self):
        body = {
            "five_hour": {"utilization": 0.452, "resets_at": "2026-05-27T03:00:00Z"},
            "seven_day": {"utilization": 0.231, "resets_at": "2026-06-01T00:00:00Z"},
        }
        items = parse_claude(body, "user@example.com")
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["id"], "claude:user@example.com:5小时")
        self.assertAlmostEqual(items[0]["used"], 45.2)
        self.assertEqual(items[0]["limit"], 100.0)
        self.assertEqual(items[0]["resetAt"], "2026-05-27T03:00:00Z")
        self.assertEqual(items[1]["id"], "claude:user@example.com:每周")
        self.assertAlmostEqual(items[1]["used"], 23.1)

    def test_fractional_utilization(self):
        body = {"five_hour": {"utilization": 0.95}}
        items = parse_claude(body, "u@e.com")
        self.assertEqual(len(items), 1)
        self.assertAlmostEqual(items[0]["used"], 95.0)

    def test_already_percentage(self):
        body = {"five_hour": {"utilization": 85.5}}
        items = parse_claude(body, "u@e.com")
        self.assertEqual(len(items), 1)
        self.assertAlmostEqual(items[0]["used"], 85.5)

    def test_camel_case_resets_at(self):
        body = {"five_hour": {"utilization": 0.5, "resetsAt": "2026-05-27T03:00:00Z"}}
        items = parse_claude(body, "u@e.com")
        self.assertEqual(items[0]["resetAt"], "2026-05-27T03:00:00Z")

    def test_missing_period(self):
        body = {}
        items = parse_claude(body, "u@e.com")
        self.assertEqual(len(items), 0)


class TestParseCodex(unittest.TestCase):
    def test_primary_and_secondary(self):
        body = {
            "rate_limit": {
                "primary_window": {"used_percent": 45.2, "reset_at": 1777046400},
                "secondary_window": {"used_percent": 23.1, "reset_at": 1777046400},
            }
        }
        items = parse_codex(body, "user@example.com")
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["id"], "codex:user@example.com:5小时")
        self.assertAlmostEqual(items[0]["used"], 45.2)
        self.assertIsNotNone(items[0]["resetAt"])

    def test_unix_seconds(self):
        body = {
            "rate_limit": {
                "primary_window": {"used_percent": 10.0, "reset_at": 1777046400},
            }
        }
        items = parse_codex(body, "u@e.com")
        self.assertIn("2026-", items[0]["resetAt"])

    def test_reset_after_seconds(self):
        body = {
            "rate_limit": {
                "primary_window": {"used_percent": 10.0, "reset_after_seconds": 3600},
            }
        }
        items = parse_codex(body, "u@e.com")
        self.assertIsNotNone(items[0]["resetAt"])

    def test_empty_rate_limit(self):
        body = {}
        items = parse_codex(body, "u@e.com")
        self.assertEqual(len(items), 0)


class TestParseGemini(unittest.TestCase):
    def test_multiple_buckets(self):
        body = {
            "buckets": [
                {
                    "modelId": "gemini-2.5-pro",
                    "tokenType": "INPUT_TOKENS",
                    "remainingFraction": 0.769,
                    "resetTime": "2026-05-27T00:00:00Z",
                },
                {
                    "modelId": "gemini-2.5-flash",
                    "tokenType": "OUTPUT_TOKENS",
                    "remainingFraction": 0.9,
                },
            ]
        }
        items = parse_gemini_buckets(body, "user@example.com")
        self.assertEqual(len(items), 2)
        self.assertAlmostEqual(items[0]["used"], 23.1)
        self.assertAlmostEqual(items[1]["used"], 10.0)

    def test_remaining_already_percentage(self):
        body = {"buckets": [{"modelId": "m", "remainingFraction": 76.9}]}
        items = parse_gemini_buckets(body, "u@e.com")
        self.assertAlmostEqual(items[0]["used"], 23.1)

    def test_empty_buckets(self):
        body = {"buckets": []}
        items = parse_gemini_buckets(body, "u@e.com")
        self.assertEqual(len(items), 0)


class TestParseAntigravity(unittest.TestCase):
    def test_multiple_models(self):
        body = {
            "models": {
                "gemini-2.5-pro": {
                    "displayName": "Gemini 2.5 Pro",
                    "quotaInfo": {
                        "remainingFraction": 0.769,
                        "resetTime": "2026-05-09T15:50:29Z",
                    },
                },
                "gemini-3.1-pro-high": {
                    "displayName": "Gemini 3.1 Pro (High)",
                    "quotaInfo": {"remainingFraction": 1.0, "resetTime": "2026-05-09T15:50:29Z"},
                },
            }
        }
        items = parse_antigravity_models(body, "user@example.com")
        self.assertEqual(len(items), 2)
        self.assertAlmostEqual(items[0]["used"], 23.1)
        self.assertAlmostEqual(items[1]["used"], 0.0)

    def test_no_quota_info(self):
        body = {"models": {"m1": {"displayName": "M1"}}}
        items = parse_antigravity_models(body, "u@e.com")
        self.assertEqual(len(items), 0)

    def test_snake_case_quota_info(self):
        body = {
            "models": {
                "m1": {
                    "displayName": "M1",
                    "quota_info": {"remainingFraction": 0.5, "reset_time": "2026-05-09T00:00:00Z"},
                },
            }
        }
        items = parse_antigravity_models(body, "u@e.com")
        self.assertEqual(len(items), 1)
        self.assertAlmostEqual(items[0]["used"], 50.0)


class TestParseKimi(unittest.TestCase):
    def test_limits_array(self):
        body = {
            "limits": [
                {
                    "name": "weekly",
                    "title": "Weekly limit",
                    "used": 123,
                    "limit": 1000,
                    "reset_at": "2026-05-27T00:00:00Z",
                    "duration": 7,
                    "timeUnit": "DAYS",
                },
                {
                    "name": "daily",
                    "title": "Daily limit",
                    "used": 50,
                    "limit": 200,
                    "resetAt": "2026-05-26T00:00:00Z",
                    "duration": 1,
                    "timeUnit": "DAYS",
                },
            ]
        }
        items = parse_kimi(body, "user@example.com")
        self.assertEqual(len(items), 2)
        self.assertAlmostEqual(items[0]["used"], 12.3)
        self.assertAlmostEqual(items[1]["used"], 25.0)

    def test_zero_limit_skipped(self):
        body = {"limits": [{"name": "x", "used": 0, "limit": 0}]}
        items = parse_kimi(body, "u@e.com")
        self.assertEqual(len(items), 0)

    def test_empty_limits(self):
        body = {"limits": []}
        items = parse_kimi(body, "u@e.com")
        self.assertEqual(len(items), 0)


if __name__ == "__main__":
    unittest.main()
