import json
import pickle
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "packages/python/src"))
import byokit
from test_calls import Connection

KEY = "synthetic-security-test-key"


def local_model(base):
    return dict(id="local/security-test", providerId="local", apiModelId="served-model",
                local={"endpoint": base}, connection={"baseUrl": base, "protocol": byokit.ApiProtocol.OPEN_AI})


class CredentialSecurityTests(unittest.TestCase):
    def setUp(self):
        Connection.requests = []
        Connection.response_data = {"choices": [{"message": {"content": "OK"}}]}

    def test_clients_and_credential_attribute_dumps_cannot_serialize_key(self):
        for constructor in [byokit.OpenAI, byokit.Anthropic]:
            client = constructor(api_key=KEY)
            request = client.chat.completions if constructor is byokit.OpenAI else client.messages
            self.assertNotIn(KEY, repr(client))
            self.assertNotIn(KEY, repr(vars(request)))
            for value in [client, request, vars(request)]:
                with self.assertRaises(TypeError):
                    pickle.dumps(value)
                with self.assertRaises(TypeError):
                    json.dumps(value, default=vars)
            with self.assertRaises(TypeError):
                request.__getstate__()
        client = byokit.OpenAI(api_key=KEY)
        with patch("http.client.HTTPSConnection", Connection):
            result = client.chat.completions.create(model="served-model", messages=[{"role": byokit.Role.USER, "content": "Hello"}])
        self.assertEqual(result.choices[0].message.content, "OK")
        self.assertNotIn(KEY, json.dumps(result))
        self.assertEqual(Connection.requests[0][2]["Authorization"], "Bearer " + KEY)

    def test_legacy_callback_client_also_blocks_serializing_accessor_state(self):
        class Source:
            def __init__(self):
                self.key = KEY

            def __call__(self):
                return self.key

        for factory in [byokit.openAI, byokit.claude]:
            client = factory(model=local_model("http://localhost:8080/v1"), api_key=Source())
            request = client.chat.completions if hasattr(client, "chat") else client.messages
            self.assertNotIn(KEY, repr(vars(request)))
            with self.assertRaises(TypeError):
                json.dumps(client, default=vars)
            with self.assertRaises(TypeError):
                pickle.dumps(client)

    def test_authenticated_remote_http_blocked_before_connection(self):
        with patch("http.client.HTTPConnection", Connection):
            for host in ["remote.example", "localhost.evil.example", "127.0.0.1.evil.example", "192.168.1.10"]:
                for key, options in [(KEY, {}), ("", {"headers": {"api-key": KEY}})]:
                    with self.assertRaises(byokit.CallError) as caught:
                        byokit.call(local_model("http://" + host + "/v1"), "Hello", key, options)
                    self.assertIn("HTTPS", str(caught.exception))
            with self.assertRaises(byokit.CallError):
                byokit.call(local_model("http://remote.example/v1"), "Hello", KEY, {"allow_insecure_http": "true"})
        self.assertEqual(Connection.requests, [])

    def test_loopback_https_and_explicit_development_opt_in(self):
        with patch("http.client.HTTPConnection", Connection), patch("http.client.HTTPSConnection", Connection):
            for base in ["https://remote.example/v1", "http://localhost:8080/v1", "http://127.0.0.1:8080/v1", "http://127.0.0.2:8080/v1", "http://[::1]:8080/v1"]:
                byokit.call(local_model(base), "Hello", KEY)
            byokit.call(local_model("http://192.168.1.10:8080/v1"), "Hello", KEY, {"allow_insecure_http": True})
        self.assertEqual(len(Connection.requests), 6)
        self.assertTrue(all(request[2]["Authorization"] == "Bearer " + KEY for request in Connection.requests))

    def test_standard_client_forwards_development_option(self):
        client = byokit.OpenAI(api_key=KEY, base_url="http://remote.example/v1")
        params = dict(model="served-model", messages=[{"role": byokit.Role.USER, "content": "Hello"}])
        with patch("http.client.HTTPConnection", Connection):
            with self.assertRaises(byokit.CallError):
                client.chat.completions.create(**params)
            self.assertEqual(Connection.requests, [])
            client.chat.completions.create(**params, options={"allow_insecure_http": True})
            byokit.OpenAI(api_key=KEY, base_url="http://remote.example/v1", allow_insecure_http=True).chat.completions.create(**params)
        self.assertEqual(len(Connection.requests), 2)
