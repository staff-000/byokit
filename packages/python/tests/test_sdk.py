import unittest
from unittest.mock import patch
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/"packages/python/src"))
import byokit
from test_calls import Connection, model

class SDKTests(unittest.TestCase):
    def setUp(self):
        Connection.requests=[]
        Connection.response_data={"choices":[{"message":{"content":"OK"},"finish_reason":"stop"}]}
    def test_client_shape_both_formats_and_rotation(self):
        key=["key-A"];reads=[]
        def source(): reads.append(1);return key[0]
        c=byokit.OpenAI(model=model(),api_key=source,runtime_checks=False)
        a=byokit.Anthropic(model=model(),api_key=source,runtime_checks=False)
        self.assertEqual(reads,[])
        with patch("byokit.inference.http.client.HTTPSConnection",Connection):
            r=c.chat.completions.create(messages=[{"role":byokit.Role.USER,"content":"Hi"}])
            key[0]="key-B";m=a.messages.create(messages=[{"role":byokit.Role.USER,"content":"Hi"}])
        self.assertEqual(r["choices"][0]["message"]["content"],"OK")
        self.assertEqual(m["content"],[{"type":"text","text":"OK"}])
        self.assertEqual([x[2]["Authorization"] for x in Connection.requests],["Bearer key-A","Bearer key-B"])
        self.assertEqual(len(reads),2)
    def test_no_key_strings_and_safe_accessor_errors(self):
        with self.assertRaises(byokit.CallError): byokit.OpenAI(model=model(),api_key="dummy-secret")
        def source(): raise RuntimeError("dummy-secret")
        c=byokit.OpenAI(model=model(),api_key=source,runtime_checks=False)
        with self.assertRaises(byokit.CallError) as e: c.chat.completions.create(messages=[{"role":byokit.Role.USER,"content":"Hi"}])
        self.assertEqual(e.exception.code,"CREDENTIAL_ERROR");self.assertNotIn("dummy-secret",str(e.exception));self.assertEqual(Connection.requests,[])
    def test_capture_and_explicit_custom_id(self):
        messages=[{"role":byokit.Role.USER,"content":"original"}]
        def source(): messages[0]["content"]="changed";return "dummy"
        c=byokit.openAI(model=model(),api_key=source,runtime_checks=False)
        with patch("byokit.inference.http.client.HTTPSConnection",Connection): c.chat.completions.create(model="custom",messages=messages)
        self.assertEqual(Connection.requests[0][1]["messages"][0]["content"],"original");self.assertEqual(Connection.requests[0][1]["model"],"custom")
    def test_validation_and_pre_cancel_do_not_read_key(self):
        import threading
        reads=[];c=byokit.OpenAI(model=model(),api_key=lambda: reads.append(1),runtime_checks=False)
        with self.assertRaises(byokit.CallError): c.chat.completions.create(messages=[{"role":byokit.Role.USER,"content":"Hi"}],stream=True)
        event=threading.Event();event.set()
        with self.assertRaises(byokit.CallError) as e: c.chat.completions.create(messages=[{"role":byokit.Role.USER,"content":"Hi"}],options={"cancel_event":event})
        self.assertEqual(e.exception.code,"CANCELED");self.assertEqual(reads,[])
