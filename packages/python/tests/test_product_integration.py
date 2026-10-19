import json
import unittest
from unittest.mock import patch

import byokit
from byokit.inference import _parse
from test_calls import Connection


class ProductIntegrationTests(unittest.TestCase):
    def local_model(self, protocol=byokit.ApiProtocol.OPEN_AI):
        return byokit.append_model([], {
            "providerId": byokit.ProviderId.LOCAL,
            "modelId": "installed",
            "baseUrl": "http://localhost:11434/v1",
            "protocol": protocol,
            "deployment": byokit.Deployment.LOCAL,
        })[0]

    def test_reasoning_only_errors_preserve_safe_metadata(self):
        for protocol in [byokit.ApiProtocol.OPEN_AI, byokit.ApiProtocol.GEMINI]:
            if protocol == byokit.ApiProtocol.GEMINI:
                data = {
                    "candidates": [{"content": {"parts": [{"thought": True, "text": "PRIVATE_THOUGHT"}]}, "finishReason": "MAX_TOKENS"}],
                    "usageMetadata": {"promptTokenCount": 3, "candidatesTokenCount": 0, "thoughtsTokenCount": 8, "totalTokenCount": 11},
                }
            else:
                data = {
                    "choices": [{"message": {"content": None, "reasoning_content": "PRIVATE_THOUGHT"}, "finish_reason": "length"}],
                    "usage": {"prompt_tokens": 3, "completion_tokens": 8, "total_tokens": 11, "completion_tokens_details": {"reasoning_tokens": 8, "private": "PRIVATE_KEY"}},
                }
            with self.assertRaises(byokit.CallError) as caught:
                _parse(data, protocol, self.local_model(protocol))
            error = caught.exception
            self.assertEqual(error.code, "EMPTY_RESPONSE")
            self.assertEqual(error.completion, {
                "finishReason": "length", "reasoningPresent": True,
                "usage": {"prompt_tokens": 3, "completion_tokens": 0 if protocol == byokit.ApiProtocol.GEMINI else 8, "total_tokens": 11, "completion_tokens_details": {"reasoning_tokens": 8}},
            })
            self.assertNotIn("PRIVATE_", json.dumps(error.__dict__))

    def test_local_custom_calls_and_compact_calls_without_credentials(self):
        for protocol in [byokit.ApiProtocol.OPEN_AI, byokit.ApiProtocol.OLLAMA]:
            model = self.local_model(protocol)
            compact = byokit.compact_models([model])[0]
            self.assertNotIn("model", compact)
            self.assertNotIn("verification", compact)
            self.assertEqual(byokit.prepare_call(model, "Hi"), byokit.prepare_call(compact, "Hi"))
            Connection.requests = []
            Connection.response_data = {"message": {"content": "OK"}} if protocol == byokit.ApiProtocol.OLLAMA else {"choices": [{"message": {"content": "OK"}}]}
            with patch("byokit.inference.http.client.HTTPConnection", Connection):
                result = byokit.call(compact, "Hi", "")
            self.assertEqual(result["choices"][0]["message"]["content"], "OK")
            self.assertEqual(len(Connection.requests), 1)
            self.assertNotIn("Authorization", Connection.requests[0][2])
            required = {**model, "deployment": "hosted", "provider": {**model["provider"], "auth": "required"}}
            with self.assertRaises(byokit.CallError):
                byokit.call(required, "Hi", "")

    def test_offline_client_validation_rejects_unsafe_settings_without_keys_in_results(self):
        key = "PRIVATE_KEY"
        for base in ["https://example.com/v1", "http://localhost:11434/v1", "http://127.0.0.1/v1", "http://[::1]:8000/v1"]:
            result = byokit.validate_client_config({"base_url": base, "api_key": key})
            self.assertEqual(result["baseUrl"], base)
            self.assertNotIn(key, json.dumps(result))
        for changes in [
            {"base_url": "http://remote.example/v1"},
            {"base_url": "https://PRIVATE_KEY@example.com"},
            {"base_url": "https://example.com/?key=PRIVATE_KEY"},
            {"protocol": "invalid"}, {"allow_insecure_http": "yes"},
            {"default_headers": {"Authorization": key}},
        ]:
            with self.assertRaises(byokit.CallError) as caught:
                byokit.validate_client_config({"base_url": "https://example.com/v1", "api_key": key, **changes})
            self.assertNotIn(key, str(caught.exception))
            self.assertNotIn(key, json.dumps(caught.exception.__dict__))
        self.assertEqual(byokit.validate_client_config({"base_url": "http://remote.example/v1", "api_key": key, "allow_insecure_http": True})["baseUrl"], "http://remote.example/v1")
