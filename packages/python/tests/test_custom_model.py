import unittest
from byokit import append_model, ApiProtocol, custom_provider_id

class CustomModelTests(unittest.TestCase):
    def test_append_and_validation(self):
        custom={"providerId":custom_provider_id("acme"),"modelId":"test","baseUrl":"https://example.com/v1","protocol":ApiProtocol.OPEN_AI}
        original=[]; result=append_model(original,custom)
        self.assertEqual(original,[])
        self.assertEqual(result[-1]["connection"]["baseUrl"],custom["baseUrl"])
        self.assertEqual(result[-1]["verification"]["status"],"unverified")
        self.assertEqual(result[-1]["lifecycle"]["status"],"UNCERTAIN")
        for patch in [{"apiKey":"secret"},{"baseUrl":"https://key@example.com"},{"baseUrl":"https://example.com?key=secret"},{"protocol":"invalid"},{"limits":{"context":-1}}]:
            with self.assertRaises(ValueError): append_model([],{**custom,**patch})
        with self.assertRaises(ValueError): append_model(result,custom)
