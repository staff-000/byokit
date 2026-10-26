import json
import unittest
from pathlib import Path
from byokit import Catalog
class CreatorSelectionTests(unittest.TestCase):
    def test_shared_fixture(self):
        data = json.loads((Path(__file__).resolve().parents[3] / 'spec/fixtures/creator-selection.json').read_text())
        c = Catalog(data)
        config = dict(providerIds=['openai','openrouter'], creatorIds=['openai'], dedupe=2, local=False)
        rows = c.get_models(config)
        self.assertEqual(len(rows), 4)
        self.assertEqual({r['modelId'] for r in rows}, {'openai/test-1','openai/test-2'})
        self.assertTrue(all(r['creatorId'] == r['model']['creatorId'] == 'openai' for r in rows))
        self.assertEqual(c.get_models(dict(config, creatorIds=['missing'])), [])
