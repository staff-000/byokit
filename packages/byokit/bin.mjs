#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { Catalog, validateConfig, checkTask } from './index.js';
const [command, file, ...args] = process.argv.slice(2);
async function run() {
  if (!['check', 'build'].includes(command) || !file) {
    console.log(
      'Usage: byokit check|build config.json [--strict] [--out catalog.json|models.js|models.py]',
    );
    return 2;
  }
  const path = resolve(file),
    config = JSON.parse(await readFile(path, 'utf8'));
  const errors = validateConfig(config);
  if (errors.length) throw new Error(errors.join('; '));
  let raw, catalogData;
  if (config.catalog) {
    raw = await readFile(resolve(dirname(path), config.catalog), 'utf8');
    catalogData = JSON.parse(raw);
  } else {
    const mod = await import('./catalog.js');
    catalogData = mod.default;
    raw = JSON.stringify(catalogData);
  }
  const catalog = new Catalog(catalogData),
    groups = catalog.select(config);
  const tasks =
    config.tasks ||
    (config.budget
      ? [
          {
            offeringIds: groups.flatMap((g) => g.offerings.map((o) => o.id)),
            budget: config.budget,
            requires: {
              features: config.filters?.requiredFeatures,
              modalities: { input: config.filters?.input, output: config.filters?.output },
            },
          },
        ]
      : []);
  const diagnostics = tasks.length
    ? tasks.flatMap((task) => checkTask(catalog, task))
    : [
        {
          code: 'BUDGET_UNDECLARED',
          message: 'Declare input and output token budgets for build-time checks.',
          severity: 'warning',
        },
      ];
  if (!groups.length)
    diagnostics.push({
      code: 'NO_MODELS',
      message: 'No offerings match this configuration.',
      severity: 'error',
    });
  for (const d of diagnostics)
    console.log(
      `${d.severity.toUpperCase()} ${d.code}${d.offeringId ? ' [' + d.offeringId + ']' : ''}: ${d.message}`,
    );
  if (
    diagnostics.some(
      (d) => d.severity === 'error' || (args.includes('--strict') && d.severity === 'warning'),
    )
  )
    return 1;
  if (command === 'build') {
    const i = args.indexOf('--out');
    if (i < 0 || !args[i + 1]) throw new Error('build requires --out');
    const output = resolve(args[i + 1]),
      data = catalog.data;
    await mkdir(dirname(output), { recursive: true });

    if (output.endsWith('.js') || output.endsWith('.mjs')) {
      const precompiled = catalog.getModels(config);
      const registry = {
        OfferingId: [...new Set(precompiled.map((o) => o.id))],
        ModelId: [...new Set(precompiled.map((o) => o.apiModelId))],
      };
      for (const feature of ['functionCalling', 'strictJsonSchema', 'thinking'])
        registry[feature[0].toUpperCase() + feature.slice(1) + 'OfferingId'] = [
          ...new Set(
            precompiled
              .filter((o) => o.features?.[feature]?.status === 'supported')
              .map((o) => o.id),
          ),
        ];
      const entries = (values) => values.map((v) => [v, v]);
      const declarations = Object.entries(registry).map(
        ([name, values]) =>
          `export declare enum ${name} {\n${entries(values)
            .map(([k, v]) => `  ${JSON.stringify(k)} = ${JSON.stringify(v)},`)
            .join('\n')}\n}`,
      );
      const runtime = Object.entries(registry)
        .map(
          ([name, values]) =>
            `export const ${name}=Object.freeze(${JSON.stringify(Object.fromEntries(entries(values)))});`,
        )
        .join('\n');
      const jsContent = `export const models = Object.freeze(${JSON.stringify(precompiled, null, 2)});\nexport function getModels() {\n  return structuredClone(models);\n}\n${runtime}\n`;
      await writeFile(output, jsContent);
      const dtsContent = `export type PrecompiledModel = {\n  id: string;\n  providerId: string;\n  modelId: string;\n  apiModelId: string;\n  name: string;\n  deployment: string;\n  connection?: { baseUrl: string; protocol: string };\n  callSupport?: { textGeneration: boolean; reason: string | null };\n  limits?: Record<string, any>;\n  features?: Record<string, any>;\n  price?: Record<string, any>;\n  tags?: string[];\n  provider?: Record<string, any>;\n  model?: Record<string, any>;\n  family?: Record<string, any> | null;\n  logos?: { provider?: string | null; family?: string | null };\n  verification?: Record<string, any>;\n  [key: string]: any;\n};\nexport declare const models: readonly PrecompiledModel[];\nexport declare function getModels(): PrecompiledModel[];\n${declarations.join('\n')}\n`;
      const dtsOutput = output.replace(/\.m?js$/, '.d.ts');
      await writeFile(dtsOutput, dtsContent);
      await writeFile(
        output + '.lock.json',
        JSON.stringify(
          {
            schemaVersion: 1,
            upstreamHash: createHash('sha256').update(raw).digest('hex'),
            configHash: createHash('sha256').update(JSON.stringify(config)).digest('hex'),
          },
          null,
          2,
        ) + '\n',
      );
      console.log(`Built precompiled model list (${precompiled.length} models) → ${output}`);
      return 0;
    }

    if (output.endsWith('.py')) {
      const precompiled = catalog.getModels(config);
      const toPyIdent = (s) => {
        let id = s
          .replace(/[^a-zA-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .toUpperCase();
        if (!id || /^[0-9]/.test(id)) id = '_' + id;
        return id;
      };
      const registry = {
        OfferingId: [...new Set(precompiled.map((o) => o.id))],
        ModelId: [...new Set(precompiled.map((o) => o.apiModelId))],
      };
      for (const feature of ['functionCalling', 'strictJsonSchema', 'thinking'])
        registry[feature[0].toUpperCase() + feature.slice(1) + 'OfferingId'] = [
          ...new Set(
            precompiled
              .filter((o) => o.features?.[feature]?.status === 'supported')
              .map((o) => o.id),
          ),
        ];
      const pyEnums = Object.entries(registry)
        .map(([name, values]) => {
          const seen = new Set();
          const lines = values.map((v) => {
            let member = toPyIdent(v);
            while (seen.has(member)) member += '_';
            seen.add(member);
            return `    ${member} = ${JSON.stringify(v)}`;
          });
          return `class ${name}(str, Enum):\n${lines.length ? lines.join('\n') : '    pass'}`;
        })
        .join('\n\n');
      const rawJson = JSON.stringify(precompiled);
      const pyContent = `"""Precompiled BYOKit model list generated at build time."""\nfrom enum import Enum\nimport copy\nimport json\n\nMODELS: list[dict] = json.loads(${JSON.stringify(rawJson)})\n\ndef get_models() -> list[dict]:\n    return copy.deepcopy(MODELS)\n\n${pyEnums}\n`;
      await writeFile(output, pyContent);
      await writeFile(
        output + '.lock.json',
        JSON.stringify(
          {
            schemaVersion: 1,
            upstreamHash: createHash('sha256').update(raw).digest('hex'),
            configHash: createHash('sha256').update(JSON.stringify(config)).digest('hex'),
          },
          null,
          2,
        ) + '\n',
      );
      console.log(`Built precompiled Python model list (${precompiled.length} models) → ${output}`);
      return 0;
    }

    const offerings = groups.flatMap((g) => g.offerings),
      providerIds = new Set(groups.map((g) => g.provider.id)),
      modelIds = new Set(offerings.map((o) => o.modelId));
    const models = data.models.filter((m) => modelIds.has(m.id)),
      familyIds = new Set(models.map((m) => m.familyId));
    const families = data.families.filter((f) => familyIds.has(f.id)),
      providers = data.providers.filter((p) => providerIds.has(p.id));
    const assets = new Set([...providers, ...families].map((x) => x.logoId));
    const offeringIds = new Set(offerings.map((o) => o.id));
    const slim = {
      ...data,
      verifications: (data.verifications || []).filter((r) => offeringIds.has(r.offeringId)),
      providers,
      models,
      families,
      offerings,
      assets: (data.assets || []).filter((a) => assets.has(a.id)),
      presets: [{ id: config.preset || 'global', providerIds: [...providerIds] }],
    };
    await writeFile(output, JSON.stringify(slim, null, 2) + '\n');
    await writeFile(
      output + '.lock.json',
      JSON.stringify(
        {
          schemaVersion: 1,
          upstreamHash: createHash('sha256').update(raw).digest('hex'),
          configHash: createHash('sha256').update(JSON.stringify(config)).digest('hex'),
        },
        null,
        2,
      ) + '\n',
    );
    const registry = {
      OfferingId: [...new Set(offerings.map((o) => o.id))],
      ModelId: [...new Set(offerings.map((o) => o.apiModelId))],
    };
    for (const feature of ['functionCalling', 'strictJsonSchema', 'thinking'])
      registry[feature[0].toUpperCase() + feature.slice(1) + 'OfferingId'] = [
        ...new Set(
          offerings.filter((o) => o.features?.[feature]?.status === 'supported').map((o) => o.id),
        ),
      ];
    const entries = (values) => values.map((v) => [v, v]);
    const declarations = Object.entries(registry).map(
      ([name, values]) =>
        `export declare enum ${name} {\n${entries(values)
          .map(([k, v]) => `  ${JSON.stringify(k)} = ${JSON.stringify(v)},`)
          .join('\n')}\n}`,
    );
    const runtime = Object.entries(registry)
      .map(
        ([name, values]) =>
          `export const ${name}=Object.freeze(${JSON.stringify(Object.fromEntries(entries(values)))});`,
      )
      .join('\n');
    await writeFile(output + '.ids.d.ts', declarations.join('\n') + '\n');
    await writeFile(output + '.ids.js', runtime + '\n');
    // Keep the old declaration filename as a compatibility re-export.
    await writeFile(output + '.d.ts', `export * from './${output.split(/[\\/]/).pop()}.ids.js';\n`);
    console.log(`Built ${providers.length} providers / ${offerings.length} offerings → ${output}`);
  } else console.log(`Checked ${groups.length} providers; ${diagnostics.length} diagnostics.`);
  return 0;
}
run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(
      `Error: ${err?.message || 'Invalid configuration or catalog. Run with a valid local config file.'}`,
    );
    process.exitCode = 2;
  });
