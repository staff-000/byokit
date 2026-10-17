import json, os, sys, unittest
from pathlib import Path

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / "packages/python/src"))
from byokit import Catalog, check_fit, validate_config, load_catalog, serialize_query


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.catalog = Catalog(
            json.loads((root / "spec/fixtures/catalog.json").read_text())
        )

    def test_serialize_query_and_caching(self):
        # 1. Deterministic serialization
        self.assertEqual(
            serialize_query("china"),
            serialize_query({"list": "china"}),
        )
        self.assertEqual(
            serialize_query({"limit": 5, "list": "global"}),
            serialize_query({"list": "global", "limit": 5}),
        )
        self.assertEqual(
            serialize_query(),
            serialize_query({}),
        )

        # 2. Cache detection before call
        query = {"list": "global", "limit": 2}
        self.assertFalse(self.catalog.has_cached(query))
        self.assertIsNone(self.catalog.get_cached(query))

        # 3. First call populates cache
        first = self.catalog.get_models(query)
        self.assertTrue(self.catalog.has_cached(query))
        self.assertTrue(self.catalog.has_cached({"limit": 2, "list": "global"}))
        cached = self.catalog.get_cached(query)
        self.assertIsInstance(cached, list)
        self.assertEqual(len(cached), len(first))

        # 4. Second call returns cached result directly
        second = self.catalog.get_models({"limit": 2, "list": "global"})
        self.assertEqual(first, second)

        # 5. Cache mutation isolation
        first[0]["name"] = "MUTATED_NAME"
        third = self.catalog.get_models(query)
        self.assertNotEqual(third[0]["name"], "MUTATED_NAME")

        # 6. Cache clearing
        self.catalog.clear_cache()
        self.assertFalse(self.catalog.has_cached(query))
        self.assertIsNone(self.catalog.get_cached(query))


    def test_bundled(self):
        self.assertTrue(load_catalog().select())

    def test_limits(self):
        self.assertEqual(
            check_fit(
                self.catalog.get("test/small"),
                {"inputTokens": 7000, "outputTokens": 2000},
            )["status"],
            "exceeds",
        )

    def test_unknown(self):
        self.assertEqual(
            check_fit(self.catalog.get("local/custom"), {"inputTokens": 100})["status"],
            "unknown",
        )

    def test_open_weights_not_commercial_permission(self):
        self.assertEqual(
            self.catalog.select(
                {
                    "local": False,
                    "filters": {"commercialUse": "allowed", "openWeights": True},
                }
            ),
            [],
        )

    def test_bool_not_token_count(self):
        self.assertTrue(validate_config({"budget": {"maxInputTokens": True}}))

    def test_snapshot(self):
        catalog = Catalog(json.loads((root / "catalog/catalog.json").read_text()))
        self.assertLessEqual(len(catalog.select({"preset": "china"})), 8)


if __name__ == "__main__":
    unittest.main()


class CatalogCallSupportTests(unittest.TestCase):
    def test_unsupported_call_never_reaches_transport(self):
        from unittest.mock import patch
        from byokit import call, CallError

        model = {
            "apiModelId": "image-model",
            "callSupport": {"textGeneration": False, "reason": "Unsupported model operation"},
        }
        with patch("byokit.inference.http.client.HTTPSConnection") as connection:
            with self.assertRaisesRegex(CallError, "Unsupported model operation"):
                call(model, {"messages": [{"role": "user", "content": "Hi"}]}, "key", {"runtime_checks": False})
            connection.assert_not_called()


class CLITests(unittest.TestCase):
    def test_cli_precompiled_build(self):
        import subprocess, tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "byok.config.json"
            config_file.write_text(json.dumps({
                "list": "official",
                "local": False,
                "sort": "alphabeticalAscend",
                "filters": {"callable": True},
            }))
            py_out = Path(tmpdir) / "generated_models.py"
            env = {"PYTHONPATH": str(root / "packages/python/src"), "PATH": os.environ.get("PATH", "")}
            result = subprocess.run(
                [sys.executable, "-m", "byokit.cli", "build", str(config_file), "--out", str(py_out)],
                capture_output=True,
                text=True,
                env=env,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(py_out.exists())
            self.assertTrue(Path(str(py_out) + ".lock.json").exists())
            self.assertIn("MODELS", py_out.read_text())
            self.assertIn("class OfferingId", py_out.read_text())

            check_run = subprocess.run(
                [sys.executable, "-c", f"import sys; sys.path.insert(0, {json.dumps(tmpdir)}); import generated_models; m = generated_models.get_models(); assert len(m) > 0; print('OK')"],
                capture_output=True,
                text=True,
            )
            self.assertEqual(check_run.returncode, 0, check_run.stderr)
            self.assertIn("OK", check_run.stdout)
