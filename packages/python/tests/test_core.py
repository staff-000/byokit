import json, os, sys, unittest
from pathlib import Path

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / "packages/python/src"))
from byokit import (
    Catalog,
    check_fit,
    validate_config,
    load_catalog,
    serialize_query,
    get_config,
    get_config_json,
    to_config,
    to_config_json,
    ModelSort,
    ModelList,
    LIVE,
    Tag,
)


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.catalog = Catalog(
            json.loads((root / "spec/fixtures/catalog.json").read_text())
        )

    def test_live_list(self):
        live = self.catalog.get_models(LIVE)
        default = self.catalog.get_models()
        self.assertEqual(live, default)
        self.assertTrue(all(o["lifecycle"]["status"] != "OUTDATED" for o in live))

    def test_preview_tag_and_default_exclusion(self):
        self.assertEqual(Tag.CHANNEL_PREVIEW.value, "channel:preview")
        self.assertEqual(Tag.PREVIEW.value, "channel:preview")
        self.assertEqual(Tag.MODEL_PREVIEW.value, "channel:preview")

        raw = json.loads((root / "spec/fixtures/catalog.json").read_text())
        raw["offerings"] = [
            dict(raw["offerings"][0], id=f"test/{ch}", apiModelId=f"model-{ch}", status="stable" if ch == "stable" else ch)
            for ch in ["stable", "preview", "experimental", "unknown"]
        ]
        cat = Catalog(raw)

        base = {"local": False, "ui": {"maxModelsPerProvider": 10}}

        # 1. Default excludes preview and experimental
        default_list = cat.get_models(base)
        self.assertEqual([o["id"] for o in default_list], ["test/stable", "test/unknown"])
        self.assertTrue(all("channel:preview" not in o["tags"] for o in default_list))

        # 2. Explicitly include previews
        with_previews = cat.get_models(dict(base, filters={"includePreviews": True}))
        self.assertEqual([o["id"] for o in with_previews], ["test/experimental", "test/preview", "test/stable", "test/unknown"])
        preview_offering = next(o for o in with_previews if o["id"] == "test/preview")
        exp_offering = next(o for o in with_previews if o["id"] == "test/experimental")
        stable_offering = next(o for o in with_previews if o["id"] == "test/stable")
        self.assertIn("channel:preview", preview_offering["tags"])
        self.assertIn("channel:preview", exp_offering["tags"])
        self.assertNotIn("channel:preview", stable_offering["tags"])

        # 3. Filter by includeTags
        tagged = cat.get_models(dict(base, filters={"includeTags": [Tag.CHANNEL_PREVIEW]}))
        self.assertEqual([o["id"] for o in tagged], ["test/experimental", "test/preview"])


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

    def test_get_config_and_json(self):
        conf = get_config()
        self.assertEqual(conf, {"list": "default", "filters": {"callable": True}})
        self.assertEqual(validate_config(conf), [])

        conf2 = get_config("china", {"sort": ModelSort.PRICE_ASCEND, "limit": 5})
        self.assertEqual(conf2, {"list": "china", "preset": "china", "sort": "priceAscend", "limit": 5, "filters": {"callable": True}})
        self.assertEqual(validate_config(conf2), [])

        json_str = get_config_json("global", {"limit": 3})
        self.assertIsInstance(json_str, str)
        parsed = json.loads(json_str)
        self.assertEqual(parsed, {"list": "global", "preset": "global", "limit": 3, "filters": {"callable": True}})

        # Catalog methods and aliases
        self.assertEqual(self.catalog.get_config(), {"list": "default", "filters": {"callable": True}})
        self.assertIsInstance(self.catalog.get_config_json(), str)
        self.assertEqual(to_config("china"), {"list": "china", "preset": "china", "filters": {"callable": True}})
        self.assertIsInstance(to_config_json("china"), str)

        # Complete list remains raw without default callable filter
        self.assertEqual(to_config("complete"), {"list": "complete"})
        self.assertEqual(to_config({"filters": {"callable": False}}), {"list": "default", "filters": {"callable": False}})
        self.assertEqual(to_config("official-flagship"), {"list": "official-flagship", "preset": "official-flagship", "filters": {"callable": True, "official": True}})
        self.assertEqual(to_config("official"), {"list": "official", "preset": "official-flagship", "filters": {"callable": True, "official": True}})


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

    def test_release_date_filters(self):
        from byokit import Tag, Any
        fixture = json.loads((root / "spec/fixtures/catalog.json").read_text())
        as_of = "2026-10-12T12:00:00Z"
        fixture["offerings"][0]["releaseDate"] = "2026-09-27"
        cat = Catalog(fixture)
        self.assertEqual(len(cat.get_models({"asOf": as_of, "local": False, "filters": {"includeTags": [Tag.RELEASE_WITHIN_1_MONTH]}})), 1)
        m = cat.get_models({"asOf": as_of, "local": False, "filters": {"includeTags": Any(Tag.RELEASE_WITHIN_1_MONTH)}})
        self.assertEqual(len(m), 1)
        self.assertIn("release:1m", m[0]["tags"])
        self.assertIn("release:1y", m[0]["tags"])
        self.assertEqual(
            len(cat.get_models({"asOf": as_of, "local": False, "filters": {"releasedWithin": "1m"}})),
            1,
        )
        self.assertEqual(
            len(cat.get_models({"asOf": as_of, "local": False, "filters": {"releasedWithin": Tag.RELEASE_WITHIN_1_YEAR}})),
            1,
        )
        self.assertEqual(len(validate_config({"filters": {"releasedWithin": "1m"}})), 0)
        self.assertTrue(len(validate_config({"filters": {"releasedWithin": "invalid"}})) > 0)


    def test_speed_sort_raises_not_implemented(self):
        from byokit import ModelSort
        for sort in [
            ModelSort.SPEED,
            ModelSort.SPEED_ASCEND,
            ModelSort.SPEED_DESCEND,
            "speed",
            "speedAscend",
            "speedDescend",
        ]:
            with self.assertRaises(NotImplementedError):
                self.catalog.get_models({"sort": sort})

    def test_modality_filters(self):
        from byokit import Modality, Exact, Contain, Any, exact, contain, any

        self.assertEqual(exact([Modality.TEXT]), {"mode": "exact", "values": ["text"]})
        self.assertEqual(Exact(Modality.TEXT), {"mode": "exact", "values": ["text"]})
        self.assertEqual(contain([Modality.TEXT]), {"mode": "contain", "values": ["text"]})
        self.assertEqual(Contain(Modality.TEXT), {"mode": "contain", "values": ["text"]})
        self.assertEqual(any([Modality.TEXT, Modality.IMAGE]), {"mode": "any", "values": ["text", "image"]})
        self.assertEqual(Any([Modality.TEXT, Modality.IMAGE]), {"mode": "any", "values": ["text", "image"]})

        data = json.loads((root / "spec/fixtures/catalog.json").read_text())
        data["offerings"][0]["modalities"] = {"input": ["text"], "output": ["text"]}

        multi_out = dict(data["offerings"][0], id="test/image-text", modalities={"input": ["text"], "output": ["text", "image"]})
        vision_in = dict(data["offerings"][0], id="test/vision-in", modalities={"input": ["text", "image"], "output": ["text"]})
        audio_out = dict(data["offerings"][0], id="test/audio-out", modalities={"input": ["text"], "output": ["text", "audio"]})

        data["offerings"] = [data["offerings"][0], multi_out, vision_in, audio_out]
        for p in data["presets"]:
            p["offeringIds"] = [o["id"] for o in data["offerings"]]

        cat = Catalog(data)

        # Legacy output arrays still require the exact output set.
        self.assertEqual([m["id"] for m in cat.get_models({"local": False, "filters": {"output": [Modality.TEXT]}})], ["test/small", "test/vision-in"])

        # 2. Exact on output
        text_exact_explicit = [m["id"] for m in cat.get_models({"local": False, "filters": {"output": Exact([Modality.TEXT])}})]
        self.assertEqual(text_exact_explicit, ["test/small", "test/vision-in"])

        # 3. Contain on output
        text_contain = [m["id"] for m in cat.get_models({"local": False, "filters": {"output": Contain([Modality.TEXT])}})]
        self.assertEqual(text_contain, ["test/audio-out", "test/image-text", "test/small", "test/vision-in"])

        # 4. Exact on output for both text and image
        multi_exact = [m["id"] for m in cat.get_models({"local": False, "filters": {"output": Exact([Modality.TEXT, Modality.IMAGE])}})]
        self.assertEqual(multi_exact, ["test/image-text"])

        # 5. Any on output
        image_or_audio = [m["id"] for m in cat.get_models({"local": False, "filters": {"output": Any([Modality.IMAGE, Modality.AUDIO])}})]
        self.assertEqual(image_or_audio, ["test/audio-out", "test/image-text"])

        self.assertEqual([m["id"] for m in cat.get_models({"local": False, "filters": {"input": [Modality.IMAGE]}})], ["test/vision-in"])
        image_in = [m["id"] for m in cat.get_models({"local": False, "filters": {"input": Contain([Modality.IMAGE])}})]
        self.assertEqual(image_in, ["test/vision-in"])

        # 7. Shorthand format
        shorthand = [m["id"] for m in cat.get_models({"local": False, "filters": {"output": {"contain": ["text"]}}})]
        self.assertEqual(shorthand, text_contain)

        # 8. Bundled catalog check
        bundled_cat = load_catalog()
        bundled_text_only = [
            m["id"]
            for m in bundled_cat.get_models({
                "providerIds": Any("openai", "google"),
                "filters": {"output": Exact(Modality.TEXT), "callable": False},
            })
        ]
        self.assertNotIn("openai/chatgpt-image-latest", bundled_text_only)
        self.assertNotIn("google/lyria-3-pro-preview", bundled_text_only)

        bundled_contain = [
            m["id"]
            for m in bundled_cat.get_models({
                "providerIds": Exact("openai"),
                "filters": {"output": Contain([Modality.TEXT]), "callable": False},
            })
        ]
        self.assertIn("openai/chatgpt-image-latest", bundled_contain)

    def test_get_models_by_provider(self):
        from byokit import get_models_by_provider, Catalog, Any

        data = json.loads((root / "spec/fixtures/catalog.json").read_text())
        cat = Catalog(data)
        grouped = cat.get_models_by_provider()
        self.assertIsInstance(grouped, dict)
        self.assertIn("test", grouped)
        self.assertIsInstance(grouped["test"], list)
        self.assertEqual(len(grouped["test"]), 1)
        self.assertEqual(grouped["test"][0]["id"], "test/large")

        bundled_grouped = get_models_by_provider({
            "providerIds": Any("anthropic", "openai"),
            "local": False,
        })
        self.assertIn("anthropic", bundled_grouped)
        self.assertIn("openai", bundled_grouped)
        self.assertTrue(len(bundled_grouped["anthropic"]) > 0)
        self.assertTrue(len(bundled_grouped["openai"]) > 0)
        self.assertTrue(all(m["provider"]["id"] == "anthropic" for m in bundled_grouped["anthropic"]))
        self.assertTrue(all(m["provider"]["id"] == "openai" for m in bundled_grouped["openai"]))

    def test_callable_default_and_override(self):
        from byokit import load_catalog, Exact
        bundled_cat = load_catalog()
        default_callable = bundled_cat.get_models({"providerIds": Exact("openai"), "local": False})
        self.assertGreater(len(default_callable), 0)
        self.assertTrue(all(m.get("callSupport", {}).get("textGeneration") is True for m in default_callable))
        self.assertFalse(any(m["id"] == "openai/chatgpt-image-latest" for m in default_callable))

        explicit_non_callable = bundled_cat.get_models({
            "providerIds": Exact("openai"),
            "local": False,
            "filters": {"callable": False},
        })
        self.assertGreater(len(explicit_non_callable), 0)
        self.assertTrue(all(m.get("callSupport", {}).get("textGeneration") is False for m in explicit_non_callable))
        self.assertTrue(any(m["id"] == "openai/chatgpt-image-latest" for m in explicit_non_callable))

    def test_official_flagship_preset(self):
        from byokit import load_catalog, OFFICIAL_FLAGSHIP, OFFICIAL, ModelSort, Exact
        bundled_cat = load_catalog()
        models = bundled_cat.get_models(OFFICIAL_FLAGSHIP, {"sort": ModelSort.PROVIDER_ORDER})
        self.assertEqual(
            [m["id"] for m in models],
            [
                "openai/gpt-6.1-sol",
                "anthropic/claude-opus-5-5",
                "google/gemini-4-argon",
                "mistral/mistral-large-4",
                "deepseek/deepseek-v4-pro",
                "zhipuai/glm-5.3",
            ],
        )
        anthropic_flagship = bundled_cat.get_models({
            "preset": "official-flagship",
            "providerIds": Exact("anthropic"),
        })
        self.assertEqual([m["id"] for m in anthropic_flagship], ["anthropic/claude-opus-5-5"])

    def test_combinators_and_speciality_tier(self):
        from byokit import (
            load_catalog,
            Speciality,
            Tier,
            Exact,
            Contain,
            Any,
            Exclude,
            and_,
            or_,
            xor,
            not_,
            exact,
            contain,
            any as any_,
            exclude,
            get_model_tier,
        )
        cat = load_catalog()

        self.assertGreater(len(cat.get_models({"providerIds": ["openai"], "local": False})), 0)
        for sel in ["speciality", "tier", "deployment", "origin", "input", "output", "requiredFeatures", "lifecycle", "popularity"]:
            with self.assertRaises(ValueError):
                cat.get_models({"filters": {sel: ["foo"]}})

        # Speciality exact selection
        general_models = cat.get_models({
            "providerIds": Any("openai", "google", "anthropic", "deepseek"),
            "filters": {"speciality": Exact(Speciality.GENERAL)},
        })
        self.assertTrue(len(general_models) > 0)
        self.assertTrue(all(m["speciality"] == Speciality.GENERAL.value for m in general_models))

        # Check cybersecurity models like daybreak
        cyber_models = cat.get_models({
            "providerIds": Exact("openai"),
            "filters": {"speciality": Exact(Speciality.CYBERSECURITY)},
        })
        self.assertTrue(len(cyber_models) > 0)
        self.assertTrue(any("daybreak" in m["id"] for m in cyber_models))

        # Tier selection
        flash_models = cat.get_models({
            "providerIds": Any("google", "deepseek"),
            "filters": {"tier": Exact(Tier.FLASH)},
        })
        self.assertTrue(len(flash_models) > 0)
        self.assertTrue(all(m["tier"] == Tier.FLASH.value for m in flash_models))

        # Test Edge tier inference
        self.assertEqual(get_model_tier({"apiModelId": "reka-edge"}), Tier.EDGE.value)
        self.assertEqual(get_model_tier({"apiModelId": "phi-3-mini-4k-instruct-on-device"}), Tier.EDGE.value)
        self.assertEqual(get_model_tier({"apiModelId": "gemma-2b-mobile"}), Tier.EDGE.value)
        self.assertEqual(get_model_tier({"apiModelId": "tiny-aya"}), Tier.EDGE.value)
        self.assertEqual(get_model_tier({"apiModelId": "custom-model", "tier": Tier.EDGE.value}), Tier.EDGE.value)

        # Nested combinators: any(exact('general', exclude('lite')), exact('flash'))
        nested = cat.get_models({
            "providerIds": Any("google"),
            "filters": {
                "speciality": Exact(Speciality.GENERAL),
                "tier": any_(
                    and_(Exact(Tier.FLASH), not_(Exact(Tier.LITE))),
                    Exact(Tier.WORKHORSE),
                ),
            },
        })
        self.assertTrue(len(nested) > 0)

        # Boolean logic: xor
        xor_result = cat.get_models({
            "providerIds": xor(Exact("openai"), Exact("google")),
            "limit": 5,
        })
        self.assertTrue(len(xor_result) > 0)




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
