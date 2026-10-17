import { readFile } from 'node:fs/promises';
import ts from 'typescript';
export async function buildPlaygroundWorker() {
  const files = [
    'enums.js',
    'core.js',
    'client.js',
    'connection.js',
    'custom-model.js',
    'call.js',
    'sdk.js',
    'index.js',
    'catalog.js',
  ];
  const entries = [];
  for (const name of files) {
    const source = await readFile(new URL('../packages/byokit/' + name, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      fileName: name,
    }).outputText;
    entries.push(JSON.stringify(name) + ': function(require,module,exports){\n' + compiled + '\n}');
  }
  const runner = await readFile(
    new URL('../website/playground-worker.js', import.meta.url),
    'utf8',
  );
  return `const modules={${entries.join(',\n')}};
const cache={};
function require(name){name=name.replace(/^\\.\\//,'');if(!modules[name])throw new Error('External imports are unavailable in this offline playground');if(!cache[name]){cache[name]={exports:{}};modules[name](require,cache[name],cache[name].exports)}return cache[name].exports;}
globalThis.__BYOKIT_NO_RUNTIME_WARNING__=true;
const all=require('catalog.js');
const unavailable=['call','callClaude','Byokit','openAI','claude','OpenAI','Anthropic'];
const byokit=Object.freeze(Object.fromEntries(Object.entries(all).filter(([key])=>!unavailable.includes(key))));
${runner}`;
}
