import json, sys
from pathlib import Path

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / "packages/python/src"))
from byokit import Catalog, check_fit

catalog = Catalog(json.loads((root / "spec/fixtures/catalog.json").read_text()))
if len(sys.argv) > 1 and sys.argv[1] == "models":
    payload = json.load(sys.stdin)
    catalog = Catalog(payload["data"])
    print(json.dumps([catalog.get_models(c) for c in payload["queries"]]))
elif len(sys.argv) > 1:
    print(json.dumps([catalog.select(c) for c in json.load(sys.stdin)]))
else:
    cases = json.loads((root / "spec/conformance/fit.json").read_text())
    print(
        json.dumps(
            [check_fit(catalog.get(c["offeringId"]), c["budget"]) for c in cases]
        )
    )
