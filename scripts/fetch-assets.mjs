import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';
const [source,out]=process.argv.slice(2);if(!source||!out)throw new Error('Usage: node scripts/fetch-assets.mjs catalog.json output-directory');
const catalog=JSON.parse(await readFile(source,'utf8'));await mkdir(out,{recursive:true});const manifest={};
for(const asset of catalog.assets || []){
 const url=new URL(asset.light);
 if(url.origin!=='https://models.dev'||!/^\/logos\/[a-z0-9-]+\.svg$/.test(url.pathname))throw new Error('Unapproved asset URL');
 const response=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)throw new Error('Asset download failed');
 const text=await response.text();
 // Conservative subset: reject active/external markup instead of attempting permissive sanitization.
 if(text.length>200000||!/<svg\b/i.test(text)||/<\s*(script|foreignObject|image|use|iframe|style)\b|\bon\w+\s*=|\b(?:href|src)\s*=|<!|url\s*\(/i.test(text))throw new Error('SVG contains unsupported active/external markup');
 const name=asset.id.replace(/[^a-zA-Z0-9_-]/g,'_')+'.svg';await writeFile(join(resolve(out),name),text);
 manifest[asset.id]={...asset,light:name};
}
await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(`Wrote ${Object.keys(manifest).length} local logos`);
