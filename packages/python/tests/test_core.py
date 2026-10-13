import json, sys, unittest
from pathlib import Path
root=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(root/'packages/python/src'))
from byokit import Catalog,check_fit,validate_config,load_catalog

class CoreTests(unittest.TestCase):
 def setUp(self): self.catalog=Catalog(json.loads((root/'spec/fixtures/catalog.json').read_text()))
 def test_bundled(self): self.assertTrue(load_catalog().select())
 def test_limits(self): self.assertEqual(check_fit(self.catalog.get('test/small'),{'inputTokens':7000,'outputTokens':2000})['status'],'exceeds')
 def test_unknown(self): self.assertEqual(check_fit(self.catalog.get('local/custom'),{'inputTokens':100})['status'],'unknown')
 def test_open_weights_not_commercial_permission(self): self.assertEqual(self.catalog.select({'local':False,'filters':{'commercialUse':'allowed','openWeights':True}}),[])
 def test_bool_not_token_count(self): self.assertTrue(validate_config({'budget':{'maxInputTokens':True}}))
 def test_snapshot(self):
  catalog=Catalog(json.loads((root/'catalog/catalog.json').read_text()))
  self.assertLessEqual(len(catalog.select({'preset':'china'})),8)

if __name__=='__main__': unittest.main()
