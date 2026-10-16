import json
import threading
import time
import unittest
from unittest.mock import patch
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "packages/python/src"))
import byokit
from byokit.inference import PROVIDERS, prepare_call


class Response:
    status = 200

    def __init__(self, data):
        self.data = data

    def read(self):
        return json.dumps(self.data).encode()


class Connection:
    requests = []
    response_data = {
        "choices": [{"message": {"content": "OK"}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 3, "completion_tokens": 1},
    }

    def __init__(self, *args, **kwargs):
        self.sock = None

    def request(self, method, path, body, headers):
        self.requests.append((path, json.loads(body), dict(headers)))

    def getresponse(self):
        return Response(self.response_data)

    def close(self):
        pass


def model(provider="deepseek"):
    base, protocol = PROVIDERS[provider]
    return dict(
        id=provider + "/demo",
        providerId=provider,
        apiModelId="served-demo",
        connection=dict(baseUrl=base, protocol=protocol),
        limits=dict(context=1000, input=900, output=200, contextAccounting="combined"),
        features={"functionCalling": {"status": "supported"}},
    )


class CallTests(unittest.TestCase):
    def test_provider_routes_and_both_formats(self):
        for provider, (_, protocol) in PROVIDERS.items():
            if protocol == byokit.ApiProtocol.CLAUDE:
                data = {
                    "content": [{"type": "text", "text": "OK"}],
                    "stop_reason": "end_turn",
                    "usage": {"input_tokens": 3, "output_tokens": 1},
                }
            elif protocol == byokit.ApiProtocol.GEMINI:
                data = {
                    "candidates": [{"content": {"parts": [{"text": "OK"}]}}],
                    "usageMetadata": {"promptTokenCount": 3, "candidatesTokenCount": 1},
                }
            else:
                data = {
                    "choices": [
                        {"message": {"content": "OK"}, "finish_reason": "stop"}
                    ],
                    "usage": {"prompt_tokens": 3, "completion_tokens": 1},
                }
            Connection.response_data = data
            Connection.requests = []
            with patch("byokit.inference.http.client.HTTPSConnection", Connection):
                r = byokit.call(
                    model(provider), "Hi", "dummy-key", {"runtime_checks": False}
                )
                c = byokit.call_claude(
                    model(provider), "Hi", "dummy-key", {"runtime_checks": False}
                )
            self.assertEqual(r["choices"][0]["message"]["content"], "OK")
            self.assertEqual(c["content"], [{"type": "text", "text": "OK"}])
            self.assertEqual(len(Connection.requests), 2)
            self.assertNotIn("dummy-key", json.dumps(r))
            self.assertNotIn("dummy-key", json.dumps(Connection.requests[0][1]))
            self.assertTrue(
                any("dummy-key" in v for v in Connection.requests[0][2].values())
            )

    def test_tools_system_and_choices(self):
        p = {
            "system": "Brief",
            "messages": [
                {
                    "role": "assistant",
                    "content": [
                        {"type": "tool_use", "id": "c", "name": "lookup", "input": {}}
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "tool_result", "tool_use_id": "c", "content": "found"}
                    ],
                },
            ],
            "tools": [{"name": "lookup", "input_schema": {"type": "object"}}],
            "tool_choice": {"type": "tool", "name": "lookup"},
        }
        deep = prepare_call(model(), p, format="claude", runtime_checks=False)["body"]
        self.assertEqual(deep["messages"][2]["role"], "tool")
        gem = prepare_call(model("google"), p, format="claude", runtime_checks=False)[
            "body"
        ]
        self.assertEqual(
            gem["contents"][1]["parts"][0]["functionResponse"]["name"], "lookup"
        )

    def test_budgets_and_essential_validation(self):
        p = {"messages": [{"role": "user", "content": "Hi"}], "max_tokens": 201}
        # By default, check_budget is False, so prepare_call succeeds without MODEL_FIT_FAILED
        self.assertEqual(prepare_call(model(), p)["body"]["max_tokens"], 201)
        with self.assertRaises(byokit.CallError) as e:
            prepare_call(model(), p, check_budget=True)
        self.assertEqual(e.exception.code, "MODEL_FIT_FAILED")
        self.assertEqual(
            prepare_call(model(), p, runtime_checks=False)["body"]["max_tokens"], 201
        )
        self.assertEqual(
            prepare_call(model(), "Hi", runtime_checks=False)["body"]["max_tokens"], 200
        )
        with self.assertRaises(byokit.CallError):
            prepare_call(
                model(),
                {"messages": p["messages"], "stream": True},
                runtime_checks=False,
            )

    def test_tool_response_without_execution(self):
        Connection.response_data = {
            "choices": [
                {
                    "message": {
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "c",
                                "type": "function",
                                "function": {"name": "lookup", "arguments": "{}"},
                            }
                        ],
                    },
                    "finish_reason": "tool_calls",
                }
            ]
        }
        Connection.requests = []
        with patch("byokit.inference.http.client.HTTPSConnection", Connection):
            r = byokit.call_claude(model(), "Hi", "dummy", {"runtime_checks": False})
        self.assertEqual(r["stop_reason"], "tool_use")
        self.assertEqual(r["content"][0]["input"], {})
        self.assertEqual(len(Connection.requests), 1)

    def test_cancellation_timeout_and_no_secret_errors(self):
        class Blocked(Connection):
            def __init__(self, *a, **kw):
                self.sock = None
                self.closed = threading.Event()

            def getresponse(self):
                self.closed.wait(2)
                raise OSError("dummy-key")

            def close(self):
                self.closed.set()

        cancel = threading.Event()
        with patch("byokit.inference.http.client.HTTPSConnection", Blocked):
            with self.assertRaises(byokit.CallError) as e:
                byokit.call(
                    model(),
                    "Hi",
                    "dummy-key",
                    {"runtime_checks": False, "timeout_ms": 20},
                )
            self.assertEqual(e.exception.code, "TIMEOUT")
            self.assertNotIn("dummy-key", str(e.exception))
            timer = threading.Timer(0.03, cancel.set)
            timer.start()
            with self.assertRaises(byokit.CallError) as e:
                byokit.call(
                    model(),
                    "Hi",
                    "dummy-key",
                    {"runtime_checks": False, "cancel_event": cancel},
                )
            timer.join()
            self.assertEqual(e.exception.code, "CANCELED")

    def test_redirects_and_error_bodies_are_not_followed_or_exposed(self):
        class Redirect(Connection):
            def getresponse(self):
                response = Response({"secret": "dummy-key"})
                response.status = 302
                return response

        with patch("byokit.inference.http.client.HTTPSConnection", Redirect):
            with self.assertRaises(byokit.CallError) as e:
                byokit.call(model(), "Hi", "dummy-key", {"runtime_checks": False})
            self.assertEqual(e.exception.code, "PROVIDER_ERROR")
            self.assertEqual(e.exception.status, 302)
            self.assertNotIn("dummy-key", str(e.exception))
