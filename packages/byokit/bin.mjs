#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { Catalog, validateConfig, checkTask } from './index.js';
const [command, file, ...args] = process.argv.slice(2);
async function run() {
  if (!['check', 'build'].includes(command) || !file) {
    console.log('Usage: byokit check|build config.json [--strict] [--out catalog.json]');
    return 2;
  }
  const path = resolve(file),
    config = JSON.parse(await readFile(path, 'utf8'));
  const errors = validateConfig(config);
  if (errors.length) throw new Error(errors.join('; '));
  if (!config.catalog) throw new Error('config.catalog is required (relative to config file)');
  const raw = await readFile(resolve(dirname(path), config.catalog), 'utf8');
  const catalog = new Catalog(JSON.parse(raw)),
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
    await mkdir(dirname(output), { recursive: true });
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
