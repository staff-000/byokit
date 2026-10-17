import { readFile, writeFile } from 'node:fs/promises';
const spec = JSON.parse(await readFile(new URL('../spec/enums.json', import.meta.url), 'utf8'));
const header = '// Generated from spec/enums.json. Run npm run enums:generate.\n';
const js =
  header +
  Object.entries(spec)
    .map(([name, values]) => `export const ${name}=Object.freeze(${JSON.stringify(values)});`)
    .join('\n') +
  '\n';
const ts =
  header +
  Object.entries(spec)
    .map(
      ([name, values]) =>
        `export declare enum ${name} {\n${Object.entries(values)
          .map(
            ([k, v]) =>
              `  ${name === 'ModelSort' && ['Alphabetical', 'Price', 'Speed'].includes(k) ? '/** @deprecated Use an explicit Ascend/Descend member. */\n  ' : ''}${k} = ${JSON.stringify(v)},`,
          )
          .join('\n')}\n}`,
    )
    .join('\n\n') +
  '\n';
const snake = (s) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toUpperCase();
const py =
  '# Generated from spec/enums.json. Run npm run enums:generate.\nfrom enum import Enum\n\n' +
  Object.entries(spec)
    .map(
      ([name, values]) =>
        `class ${name}(str, Enum):\n${Object.entries(values)
          .map(([k, v]) => `    ${snake(k)} = ${JSON.stringify(v)}`)
          .join('\n')}`,
    )
    .join('\n\n') +
  '\n';
await writeFile(
  new URL('../packages/byokit/enums.js', import.meta.url),
  js +
    'export const DEFAULT=ModelList.Default, LIVE=ModelList.Live, COMPLETE=ModelList.Complete, CHINA=ModelList.China, GLOBAL=ModelList.Global, OFFICIAL=ModelList.Official;\n',
);
await writeFile(
  new URL('../packages/byokit/enums.d.ts', import.meta.url),
  ts +
    'export declare const DEFAULT:ModelList.Default, LIVE:ModelList.Live, COMPLETE:ModelList.Complete, CHINA:ModelList.China, GLOBAL:ModelList.Global, OFFICIAL:ModelList.Official;\n',
);
await writeFile(
  new URL('../packages/python/src/byokit/enums.py', import.meta.url),
  py +
    '\nDEFAULT=ModelList.DEFAULT\nLIVE=ModelList.LIVE\nCOMPLETE=ModelList.COMPLETE\nCHINA=ModelList.CHINA\nGLOBAL=ModelList.GLOBAL\nOFFICIAL=ModelList.OFFICIAL\n',
);
console.log(`Generated ${Object.keys(spec).length} enums for JavaScript/TypeScript and Python.`);
