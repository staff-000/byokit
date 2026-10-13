import argparse
import hashlib
import json
from pathlib import Path
from . import Catalog, check_task, validate_config

def main():
    parser=argparse.ArgumentParser(description="Build a curated BYOK catalog or check task budgets")
    parser.add_argument("command",choices=["check","build"]); parser.add_argument("config"); parser.add_argument("--strict",action="store_true"); parser.add_argument("--out")
    args=parser.parse_args()
    try:
        path=Path(args.config).resolve(); config=json.loads(path.read_text()); errors=validate_config(config)
        if errors: raise ValueError("; ".join(errors))
        raw=(path.parent/config["catalog"]).read_text(); catalog=Catalog(json.loads(raw)); groups=catalog.select(config)
        tasks=config.get("tasks",[])
        if not tasks and config.get("budget"):
            tasks=[{"offeringIds":[o["id"] for g in groups for o in g["offerings"]],"budget":config["budget"],"requires":{"features":config.get("filters",{}).get("requiredFeatures",[]),"modalities":{k:config.get("filters",{}).get(k,[]) for k in ["input","output"]}}}]
        diagnostics=[d for t in tasks for d in check_task(catalog,t)]
        if not groups: diagnostics.append({"code":"NO_MODELS","message":"No offerings match this configuration.","severity":"error"})
        for d in diagnostics: print(f'{d["severity"].upper()} {d["code"]}: {d["message"]}')
        if any(d["severity"]=="error" or args.strict for d in diagnostics): return 1
        if args.command=="build":
            if not args.out: raise ValueError("build requires --out")
            data=catalog.data.copy(); data["providers"]=[g["provider"] for g in groups]; data["offerings"]=[o for g in groups for o in g["offerings"]]
            offering_ids={o["id"] for o in data["offerings"]}; data["verifications"]=[r for r in data.get("verifications",[]) if r["offeringId"] in offering_ids]
            model_ids={o["modelId"] for o in data["offerings"]}; data["models"]=[m for m in data["models"] if m["id"] in model_ids]
            family_ids={m.get("familyId") for m in data["models"]}; data["families"]=[f for f in data["families"] if f["id"] in family_ids]
            assets={p.get("logoId") for p in data["providers"]}|{f.get("logoId") for f in data["families"]}; data["assets"]=[a for a in data.get("assets",[]) if a["id"] in assets]
            data["presets"]=[{"id":config.get("preset","global"),"providerIds":[p["id"] for p in data["providers"]]}]
            output=Path(args.out); output.parent.mkdir(parents=True,exist_ok=True); output.write_text(json.dumps(data,indent=2)+"\n")
            Path(str(output)+".lock.json").write_text(json.dumps({"schemaVersion":1,"upstreamHash":hashlib.sha256(raw.encode()).hexdigest()},indent=2)+"\n")
        print(f"Checked {len(groups)} providers; {len(diagnostics)} diagnostics."); return 0
    except (ValueError,KeyError,OSError,TypeError):
        print("Invalid configuration or catalog. Run with a valid local config file."); return 2

if __name__=="__main__": raise SystemExit(main())
