import argparse
import hashlib
import json
import re
from pathlib import Path
from . import Catalog, check_task, validate_config, load_catalog


def main():
    parser = argparse.ArgumentParser(
        description="Build a curated BYOK catalog or check task budgets"
    )
    parser.add_argument("command", choices=["check", "build"])
    parser.add_argument("config")
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--out")
    args = parser.parse_args()
    try:
        path = Path(args.config).resolve()
        config = json.loads(path.read_text())
        errors = validate_config(config)
        if errors:
            raise ValueError("; ".join(errors))
        if config.get("catalog"):
            raw = (path.parent / config["catalog"]).read_text()
            catalog = Catalog(json.loads(raw))
        else:
            catalog = load_catalog()
            raw = json.dumps(catalog.data)
        groups = catalog.select(config)
        tasks = config.get("tasks", [])
        if not tasks and config.get("budget"):
            tasks = [
                {
                    "offeringIds": [o["id"] for g in groups for o in g["offerings"]],
                    "budget": config["budget"],
                    "requires": {
                        "features": config.get("filters", {}).get(
                            "requiredFeatures", []
                        ),
                        "modalities": {
                            k: config.get("filters", {}).get(k, [])
                            for k in ["input", "output"]
                        },
                    },
                }
            ]
        diagnostics = (
            [d for t in tasks for d in check_task(catalog, t)]
            if tasks
            else [
                dict(
                    code="BUDGET_UNDECLARED",
                    message="Declare input and output token budgets for build-time checks.",
                    severity="warning",
                )
            ]
        )
        if not groups:
            diagnostics.append(
                {
                    "code": "NO_MODELS",
                    "message": "No offerings match this configuration.",
                    "severity": "error",
                }
            )
        for d in diagnostics:
            print(f"{d['severity'].upper()} {d['code']}: {d['message']}")
        if any(d["severity"] == "error" or args.strict for d in diagnostics):
            return 1
        if args.command == "build":
            if not args.out:
                raise ValueError("build requires --out")
            output = Path(args.out)
            output.parent.mkdir(parents=True, exist_ok=True)

            if args.out.endswith(".py"):
                precompiled = catalog.get_models(config)
                registry = {
                    "OfferingId": list(dict.fromkeys(o["id"] for o in precompiled)),
                    "ModelId": list(dict.fromkeys(o["apiModelId"] for o in precompiled)),
                }
                for feature in ["functionCalling", "strictJsonSchema", "thinking"]:
                    key = feature[0].upper() + feature[1:] + "OfferingId"
                    registry[key] = list(
                        dict.fromkeys(
                            o["id"]
                            for o in precompiled
                            if o.get("features", {}).get(feature, {}).get("status")
                            == "supported"
                        )
                    )

                def to_py_ident(s):
                    ident = re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_").upper()
                    if not ident or ident[0].isdigit():
                        ident = "_" + ident
                    return ident

                py_enums = []
                for name, values in registry.items():
                    seen = set()
                    lines = []
                    for v in values:
                        member = to_py_ident(v)
                        while member in seen:
                            member += "_"
                        seen.add(member)
                        lines.append(f'    {member} = "{v}"')
                    body = "\n".join(lines) if lines else "    pass"
                    py_enums.append(f"class {name}(str, Enum):\n{body}")

                raw_json = json.dumps(precompiled)
                py_content = (
                    '"""Precompiled BYOKit model list generated at build time."""\n'
                    "from enum import Enum\n"
                    "import copy\n"
                    "import json\n\n"
                    f"MODELS: list[dict] = json.loads({json.dumps(raw_json)})\n\n"
                    "def get_models() -> list[dict]:\n"
                    "    return copy.deepcopy(MODELS)\n\n"
                    "def get_models_by_provider() -> dict[str, list[dict]]:\n"
                    "    grouped: dict[str, list[dict]] = {}\n"
                    "    for m in MODELS:\n"
                    "        key = (m.get('provider') or {}).get('id') or m.get('providerId') or ('local' if m.get('local') else 'unknown')\n"
                    "        grouped.setdefault(key, []).append(copy.deepcopy(m))\n"
                    "    return grouped\n\n"
                    + "\n\n".join(py_enums)
                    + "\n"
                )
                output.write_text(py_content)
                Path(str(output) + ".lock.json").write_text(
                    json.dumps(
                        {
                            "schemaVersion": 1,
                            "upstreamHash": hashlib.sha256(raw.encode()).hexdigest(),
                            "configHash": hashlib.sha256(
                                json.dumps(config).encode()
                            ).hexdigest(),
                        },
                        indent=2,
                    )
                    + "\n"
                )
                print(
                    f"Built precompiled Python model list ({len(precompiled)} models) → {output}"
                )
                return 0

            if args.out.endswith((".js", ".mjs")):
                precompiled = catalog.get_models(config)
                registry = {
                    "OfferingId": list(dict.fromkeys(o["id"] for o in precompiled)),
                    "ModelId": list(dict.fromkeys(o["apiModelId"] for o in precompiled)),
                }
                for feature in ["functionCalling", "strictJsonSchema", "thinking"]:
                    key = feature[0].upper() + feature[1:] + "OfferingId"
                    registry[key] = list(
                        dict.fromkeys(
                            o["id"]
                            for o in precompiled
                            if o.get("features", {}).get(feature, {}).get("status")
                            == "supported"
                        )
                    )

                declarations = []
                runtime_entries = []
                for name, values in registry.items():
                    members = ",\n".join(
                        f"  {json.dumps(v)} = {json.dumps(v)}" for v in values
                    )
                    declarations.append(f"export declare enum {name} {{\n{members}\n}}")
                    rt = json.dumps({v: v for v in values})
                    runtime_entries.append(f"export const {name}=Object.freeze({rt});")

                js_content = (
                    f"export const models = Object.freeze({json.dumps(precompiled, indent=2)});\n"
                    "export function getModels() {\n"
                    "  return structuredClone(models);\n"
                    "}\n"
                    "export function getModelsByProvider() {\n"
                    "  const grouped = {};\n"
                    "  for (const m of models) {\n"
                    "    const key = m.provider?.id || m.providerId || (m.local ? 'local' : 'unknown');\n"
                    "    if (!grouped[key]) grouped[key] = [];\n"
                    "    grouped[key].push(structuredClone(m));\n"
                    "  }\n"
                    "  return grouped;\n"
                    "}\n"
                    + "\n".join(runtime_entries)
                    + "\n"
                )
                output.write_text(js_content)
                dts_content = (
                    "export type PrecompiledModel = {\n"
                    "  id: string;\n"
                    "  providerId: string;\n"
                    "  modelId: string;\n"
                    "  apiModelId: string;\n"
                    "  name: string;\n"
                    "  deployment: string;\n"
                    "  connection?: { baseUrl: string; protocol: string };\n"
                    "  callSupport?: { textGeneration: boolean; reason: string | null };\n"
                    "  limits?: Record<string, any>;\n"
                    "  features?: Record<string, any>;\n"
                    "  price?: Record<string, any>;\n"
                    "  tags?: string[];\n"
                    "  provider?: Record<string, any>;\n"
                    "  model?: Record<string, any>;\n"
                    "  family?: Record<string, any> | null;\n"
                    "  logos?: { provider?: string | null; family?: string | null };\n"
                    "  verification?: Record<string, any>;\n"
                    "  [key: string]: any;\n"
                    "};\n"
                    "export declare const models: readonly PrecompiledModel[];\n"
                    "export declare function getModels(): PrecompiledModel[];\n"
                    "export declare function getModelsByProvider(): Record<string, PrecompiledModel[]>;\n"
                    + "\n".join(declarations)
                    + "\n"
                )
                dts_output = output.with_suffix(".d.ts")
                dts_output.write_text(dts_content)
                Path(str(output) + ".lock.json").write_text(
                    json.dumps(
                        {
                            "schemaVersion": 1,
                            "upstreamHash": hashlib.sha256(raw.encode()).hexdigest(),
                            "configHash": hashlib.sha256(
                                json.dumps(config).encode()
                            ).hexdigest(),
                        },
                        indent=2,
                    )
                    + "\n"
                )
                print(
                    f"Built precompiled model list ({len(precompiled)} models) → {output}"
                )
                return 0

            data = catalog.data.copy()
            data["providers"] = [g["provider"] for g in groups]
            data["offerings"] = [o for g in groups for o in g["offerings"]]
            offering_ids = {o["id"] for o in data["offerings"]}
            data["verifications"] = [
                r
                for r in data.get("verifications", [])
                if r["offeringId"] in offering_ids
            ]
            model_ids = {o["modelId"] for o in data["offerings"]}
            data["models"] = [m for m in data["models"] if m["id"] in model_ids]
            family_ids = {m.get("familyId") for m in data["models"]}
            data["families"] = [f for f in data["families"] if f["id"] in family_ids]
            assets = {p.get("logoId") for p in data["providers"]} | {
                f.get("logoId") for f in data["families"]
            }
            data["assets"] = [a for a in data.get("assets", []) if a["id"] in assets]
            data["presets"] = [
                {
                    "id": config.get("preset", "global"),
                    "providerIds": [p["id"] for p in data["providers"]],
                }
            ]
            output.write_text(json.dumps(data, indent=2) + "\n")
            Path(str(output) + ".lock.json").write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "upstreamHash": hashlib.sha256(raw.encode()).hexdigest(),
                        "configHash": hashlib.sha256(
                            json.dumps(config).encode()
                        ).hexdigest(),
                    },
                    indent=2,
                )
                + "\n"
            )
        print(f"Checked {len(groups)} providers; {len(diagnostics)} diagnostics.")
        return 0
    except (ValueError, KeyError, OSError, TypeError) as err:
        print(f"Invalid configuration or catalog. Run with a valid local config file. ({err})")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
