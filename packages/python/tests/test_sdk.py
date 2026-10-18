import unittest
from unittest.mock import patch
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "packages/python/src"))
import byokit
from test_calls import Connection, model


class SDKTests(unittest.TestCase):
    def setUp(self):
        Connection.requests = []
        Connection.response_data = {
            "choices": [{"message": {"content": "OK"}, "finish_reason": "stop"}]
        }

    def test_client_shape_both_formats_and_rotation(self):
        key = ["key-A"]
        reads = []

        def source():
            reads.append(1)
            return key[0]

        c = byokit.OpenAI(model=model(), api_key=source, runtime_checks=False)
        a = byokit.Anthropic(model=model(), api_key=source, runtime_checks=False)
        self.assertEqual(reads, [])
        with patch("byokit.inference.http.client.HTTPSConnection", Connection):
            r = c.chat.completions.create(
                messages=[{"role": byokit.Role.USER, "content": "Hi"}]
            )
            key[0] = "key-B"
            m = a.messages.create(
                messages=[{"role": byokit.Role.USER, "content": "Hi"}]
            )
        self.assertEqual(r["choices"][0]["message"]["content"], "OK")
        self.assertEqual(m["content"], [{"type": "text", "text": "OK"}])
        self.assertEqual(
            [x[2]["Authorization"] for x in Connection.requests],
            ["Bearer key-A", "Bearer key-B"],
        )
        self.assertEqual(len(reads), 2)

    def test_no_key_strings_and_safe_accessor_errors(self):
        with self.assertRaises(byokit.CallError):
            byokit.OpenAI(model=model(), api_key="dummy-secret")

        def source():
            raise RuntimeError("dummy-secret")

        c = byokit.OpenAI(model=model(), api_key=source, runtime_checks=False)
        with self.assertRaises(byokit.CallError) as e:
            c.chat.completions.create(
                messages=[{"role": byokit.Role.USER, "content": "Hi"}]
            )
        self.assertEqual(e.exception.code, "CREDENTIAL_ERROR")
        self.assertNotIn("dummy-secret", str(e.exception))
        self.assertEqual(Connection.requests, [])

    def test_capture_and_explicit_custom_id(self):
        messages = [{"role": byokit.Role.USER, "content": "original"}]

        def source():
            messages[0]["content"] = "changed"
            return "dummy"

        c = byokit.openAI(model=model(), api_key=source, runtime_checks=False)
        with patch("byokit.inference.http.client.HTTPSConnection", Connection):
            c.chat.completions.create(model="custom", messages=messages)
        self.assertEqual(
            Connection.requests[0][1]["messages"][0]["content"], "original"
        )
        self.assertEqual(Connection.requests[0][1]["model"], "custom")

    def test_validation_and_pre_cancel_do_not_read_key(self):
        import threading

        reads = []
        c = byokit.OpenAI(
            model=model(), api_key=lambda: reads.append(1), runtime_checks=False
        )
        with self.assertRaises(byokit.CallError):
            c.chat.completions.create(
                messages=[{"role": byokit.Role.USER, "content": "Hi"}], stream=True
            )
        event = threading.Event()
        event.set()
        with self.assertRaises(byokit.CallError) as e:
            c.chat.completions.create(
                messages=[{"role": byokit.Role.USER, "content": "Hi"}],
                options={"cancel_event": event},
            )
        self.assertEqual(e.exception.code, "CANCELED")
        self.assertEqual(reads, [])


class ByokitTests(unittest.TestCase):
    def setUp(self):
        Connection.requests = []
        Connection.response_data = {
            "choices": [{"message": {"content": "OK"}, "finish_reason": "stop"}]
        }

    def test_request_keys_both_formats_and_exact_models(self):
        c = byokit.Byokit(runtime_checks=False)
        self.assertEqual(Connection.requests, [])
        other = byokit.append_model(
            [],
            {
                "providerId": byokit.custom_provider_id("acme"),
                "modelId": "other",
                "baseUrl": "https://acme.example/v1",
                "protocol": byokit.ApiProtocol.OPEN_AI,
            },
        )[0]
        with patch("byokit.inference.http.client.HTTPSConnection", Connection):
            r = c.chat.completions.create(
                model=model(),
                messages=[{"role": byokit.Role.USER, "content": "A"}],
                api_key="key-A",
            )
            m = c.messages.create(
                model=other,
                messages=[{"role": byokit.Role.USER, "content": "B"}],
                api_key="key-B",
            )
        self.assertEqual(r["choices"][0]["message"]["content"], "OK")
        self.assertEqual(m["content"], [{"type": "text", "text": "OK"}])
        self.assertEqual(
            [x[2]["Authorization"] for x in Connection.requests],
            ["Bearer key-A", "Bearer key-B"],
        )
        self.assertEqual(
            [x[1]["model"] for x in Connection.requests],
            [model()["apiModelId"], "other"],
        )
        self.assertNotIn("key-A", repr(vars(c.chat.completions)))
        self.assertNotIn("key-B", repr(vars(c.messages)))

    def test_validation_checks_and_override(self):
        c = byokit.Byokit()
        with self.assertRaises(TypeError):
            byokit.Byokit(api_key="secret")
        with self.assertRaises(byokit.CallError):
            byokit.Byokit(runtime_checks="no")
        with self.assertRaises(byokit.CallError):
            c.chat.completions.create(model="bare-id", messages=[], api_key="secret")
        with self.assertRaises(byokit.CallError):
            c.chat.completions.create(
                model=model(),
                messages=[{"role": byokit.Role.USER, "content": "Hi"}],
                api_key="secret",
                stream=True,
                options={"runtime_checks": False},
            )
        selected = model()
        selected["limits"] = {
            "context": 100,
            "output": 50,
            "input": 100,
            "contextAccounting": "shared",
        }
        with self.assertRaises(byokit.CallError) as e:
            c.chat.completions.create(
                model=selected,
                messages=[{"role": byokit.Role.USER, "content": "Hi"}],
                api_key="secret",
                options={"input_tokens": 10000, "check_budget": True},
            )
        self.assertEqual(e.exception.code, "MODEL_FIT_FAILED")
        with patch("byokit.inference.http.client.HTTPSConnection", Connection):
            c.chat.completions.create(
                model=selected,
                messages=[{"role": byokit.Role.USER, "content": "Hi"}],
                api_key="secret",
                options={"input_tokens": 10000},
            )
        self.assertEqual(len(Connection.requests), 1)

    def test_cancel_and_unauthenticated_local(self):
        import threading

        c = byokit.Byokit(runtime_checks=False)
        event = threading.Event()
        event.set()
        with patch("byokit.inference.http.client.HTTPSConnection", Connection):
            with self.assertRaises(byokit.CallError) as e:
                c.chat.completions.create(
                    model=model(),
                    messages=[{"role": byokit.Role.USER, "content": "Hi"}],
                    api_key="secret",
                    options={"cancel_event": event},
                )
            self.assertEqual(e.exception.code, "CANCELED")
            self.assertEqual(Connection.requests, [])
            local = byokit.get_models(
                {
                    "providerIds": byokit.exact(),
                    "local": [
                        {"endpoint": "http://localhost:8080/v1", "modelId": "local"}
                    ],
                }
            )[0]
            with patch("byokit.inference.http.client.HTTPConnection", Connection):
                c.chat.completions.create(
                    model=local, messages=[{"role": byokit.Role.USER, "content": "Hi"}]
                )
        self.assertNotIn("Authorization", Connection.requests[0][2])


class StandardSDKTests(unittest.TestCase):
    def setUp(self):
        Connection.requests = []
        Connection.response_data = {"choices": [{"message": {"content": "OK"}}]}

    def test_reuse_key_models_headers_and_attribute_response(self):
        headers = {"HTTP-Referer": "https://app.example", "X-OpenRouter-Title": "App"}
        c = byokit.OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key="account-key",
            default_headers=headers,
            runtime_checks=False,
        )
        headers["X-OpenRouter-Title"] = "changed"
        with patch("byokit.inference.http.client.HTTPSConnection", Connection):
            r = c.chat.completions.create(
                model="provider/A",
                messages=[{"role": byokit.Role.USER, "content": "Hello"}],
            )
            c.chat.completions.create(
                model="provider/B",
                messages=[{"role": byokit.Role.USER, "content": "Again"}],
                options={"headers": {"x-openrouter-title": "Second"}},
            )
        self.assertEqual(r.choices[0].message.content, "OK")
        self.assertEqual(r["choices"][0]["message"]["content"], "OK")
        self.assertEqual(
            [x[1]["model"] for x in Connection.requests], ["provider/A", "provider/B"]
        )
        self.assertEqual(
            [x[2]["Authorization"] for x in Connection.requests],
            ["Bearer account-key", "Bearer account-key"],
        )
        self.assertEqual(Connection.requests[0][2]["x-openrouter-title"], "App")
        self.assertEqual(Connection.requests[1][2]["x-openrouter-title"], "Second")
        self.assertNotIn("account-key", repr(c))

    def test_claude_root_endpoint_system_and_model_string(self):
        Connection.response_data = {
            "content": [{"type": "text", "text": "B-trees"}],
            "stop_reason": "end_turn",
        }
        for base in [
            "https://api.tokenify.example",
            "https://api.tokenify.example/v1/",
        ]:
            c = byokit.Anthropic(
                base_url=base, api_key="claude-key", runtime_checks=False
            )
            with patch("byokit.inference.http.client.HTTPSConnection", Connection):
                r = c.messages.create(
                    model="deepseek/example",
                    max_tokens=1024,
                    system="Be concise.",
                    messages=[{"role": byokit.Role.USER, "content": "Explain B-trees"}],
                )
            self.assertEqual(r.content[0].text, "B-trees")
            req = Connection.requests[-1]
            self.assertEqual(req[0], "/v1/messages")
            self.assertEqual(req[1]["system"], "Be concise.")
            self.assertEqual(req[2]["x-api-key"], "claude-key")

    def test_validation_metadata_and_unsafe_headers(self):
        c = byokit.OpenAI(
            base_url=model()["connection"]["baseUrl"],
            api_key="secret",
            models=[model()],
        )
        with self.assertRaises(byokit.CallError):
            c.chat.completions.create(model={}, messages=[])
        with self.assertRaises(byokit.CallError):
            c.chat.completions.create(
                model="test",
                messages=[{"role": byokit.Role.USER, "content": "Hi"}],
                options={"headers": {"AUTHORIZATION": "other"}},
            )
        with self.assertRaises(byokit.CallError):
            byokit.OpenAI(api_key="secret", base_url="https://secret@evil.example")
        with self.assertRaises(byokit.CallError):
            byokit.OpenAI(api_key="secret", default_headers={"X-Test": "a\nb"})
        with self.assertRaises(byokit.CallError):
            byokit.OpenAI(
                api_key="secret", base_url="https://wrong.example", models=[model()]
            )
        self.assertEqual(Connection.requests, [])

    def test_cancel_and_local_no_key(self):
        import threading

        cancel = threading.Event()
        cancel.set()
        c = byokit.OpenAI(api_key="secret", runtime_checks=False)
        with patch("byokit.inference.http.client.HTTPSConnection", Connection):
            with self.assertRaises(byokit.CallError) as e:
                c.chat.completions.create(
                    model="test",
                    messages=[{"role": byokit.Role.USER, "content": "Hi"}],
                    options={"cancel_event": cancel},
                )
        self.assertEqual(e.exception.code, "CANCELED")
        self.assertEqual(Connection.requests, [])
        c = byokit.OpenAI(
            base_url="http://localhost:8080/v1", api_key="", runtime_checks=False
        )
        with patch("byokit.inference.http.client.HTTPConnection", Connection):
            c.chat.completions.create(
                model="local", messages=[{"role": byokit.Role.USER, "content": "Hi"}]
            )
        self.assertNotIn("Authorization", Connection.requests[0][2])

    def test_known_budgets_fail_unknown_ids_warn_without_substitution(self):
        import warnings

        selected = model()
        selected["limits"] = {
            "context": 100,
            "input": 100,
            "output": 50,
            "contextAccounting": "shared",
        }
        c = byokit.OpenAI(
            base_url=selected["connection"]["baseUrl"],
            api_key="secret",
            models=[selected],
        )
        with patch("byokit.inference.http.client.HTTPSConnection", Connection):
            # Default options (check_budget disabled) succeeds without MODEL_FIT_FAILED
            c.chat.completions.create(
                model=selected["apiModelId"],
                max_tokens=1000,
                messages=[{"role": byokit.Role.USER, "content": "Hi"}],
            )
        self.assertEqual(len(Connection.requests), 1)
        Connection.requests = []
        with self.assertRaises(byokit.CallError) as e:
            c.chat.completions.create(
                model=selected["apiModelId"],
                max_tokens=1000,
                messages=[{"role": byokit.Role.USER, "content": "Hi"}],
                options={"check_budget": True},
            )
        self.assertEqual(e.exception.code, "MODEL_FIT_FAILED")
        self.assertEqual(Connection.requests, [])
        with (
            warnings.catch_warnings(record=True) as caught,
            patch("byokit.inference.http.client.HTTPSConnection", Connection),
        ):
            c.chat.completions.create(
                model="custom-id",
                max_tokens=1000,
                messages=[{"role": byokit.Role.USER, "content": "Hi"}],
                options={"check_budget": True},
            )
        self.assertTrue(any("OUTPUT_LIMIT_UNKNOWN" in str(w.message) for w in caught))
        self.assertEqual(Connection.requests[0][1]["model"], "custom-id")

    def test_concurrent_requests_keep_one_account_and_independent_inputs(self):
        from concurrent.futures import ThreadPoolExecutor

        c = byokit.OpenAI(
            base_url="https://gateway.example/v1",
            api_key="one-account",
            runtime_checks=False,
        )

        def run(i):
            return (
                c.chat.completions.create(
                    model="model-" + str(i),
                    messages=[{"role": byokit.Role.USER, "content": str(i)}],
                )
                .choices[0]
                .message.content
            )

        with (
            patch("byokit.inference.http.client.HTTPSConnection", Connection),
            ThreadPoolExecutor(max_workers=2) as pool,
        ):
            self.assertEqual(list(pool.map(run, [1, 2])), ["OK", "OK"])
        self.assertEqual(
            sorted(
                (x[1]["model"], x[1]["messages"][0]["content"], x[2]["Authorization"])
                for x in Connection.requests
            ),
            [
                ("model-1", "1", "Bearer one-account"),
                ("model-2", "2", "Bearer one-account"),
            ],
        )
