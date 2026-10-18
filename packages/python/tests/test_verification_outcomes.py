import json
from pathlib import Path
import unittest
from unittest.mock import patch
import byokit
from byokit.verification import classify_verification_error, valid_assessment
from test_calls import Connection, Response, model


class VerificationOutcomesTests(unittest.TestCase):
    def test_anonymous_browser_records_do_not_count_as_contributors(self):
        anonymous = {
            "id": "browser-observation",
            "offeringId": "deepseek/test",
            "checkedAt": "2026-10-18T10:00:00Z",
            "result": "passed",
            "checks": ["textGeneration"],
        }
        records = [
            anonymous,
            {**anonymous, "id": "empty-contributor", "contributor": ""},
            {**anonymous, "id": "published", "contributor": "github:someone"},
        ]
        data = {"verifications": records}
        summary = byokit.verification_summary(
            data, "deepseek/test", as_of="2026-10-18T12:00:00Z"
        )
        self.assertEqual(summary["community"]["successfulContributors"], 1)
        self.assertEqual(summary["community"]["status"], "verified")
        filtered = byokit.verification_summary(
            data,
            "deepseek/test",
            as_of="2026-10-18T12:00:00Z",
            contributor="GITHUB:SOMEONE",
        )
        self.assertEqual([r["id"] for r in filtered["records"]], ["published"])

    def test_shared_classification_fixtures(self):
        fixtures = json.loads(
            (
                Path(__file__).resolve().parents[3]
                / "spec/fixtures/verification-outcomes.json"
            ).read_text()
        )
        for fixture in fixtures:
            with self.subTest(fixture=fixture["name"]):
                options = fixture["options"]
                attempt = classify_verification_error(
                    fixture["error"],
                    body=options.get("body"),
                    retry_after=options.get("retryAfter"),
                    now=options["now"],
                )
                for key, value in fixture["expected"].items():
                    self.assertEqual(attempt[key], value)
                self.assertNotIn("private", json.dumps(attempt))
                self.assertNotIn("secret-name", json.dumps(attempt))

    def test_safe_structured_call_error_preserves_quota_and_retry(self):
        class Limited(Connection):
            def getresponse(self):
                response = Response(
                    {
                        "error": {
                            "type": "insufficient_quota",
                            "message": "private-account-key",
                        }
                    }
                )
                response.status = 429
                response.getheader = lambda name: "10"
                return response

        with patch("byokit.inference.http.client.HTTPSConnection", Limited):
            with self.assertRaises(byokit.CallError) as caught:
                byokit.call(
                    model(), "Hi", "private-account-key", {"runtime_checks": False}
                )
            self.assertEqual(caught.exception.code, "PROVIDER_ERROR")
            self.assertEqual(caught.exception.attempt["reason"], "quota_exhausted")
            self.assertEqual(caught.exception.attempt["retry"]["afterSeconds"], 10)
            self.assertNotIn("private-account-key", json.dumps(vars(caught.exception)))

    def test_schema_validation_rejects_private_and_inconsistent_assessments(self):
        assessment = {
            "attempt": classify_verification_error({"status": 403}),
            "checks": {"textGeneration": "blocked", "speed": "not_run"},
        }
        self.assertTrue(valid_assessment(assessment))
        assessment["attempt"]["rawBody"] = "private-key"
        self.assertFalse(valid_assessment(assessment))
