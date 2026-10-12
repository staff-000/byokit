import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname),port=Number(process.env.BYOKIT_PORT||4173);
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname==='/'?'/examples/index.html':new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root+'/'))throw new Error('outside');const body=await readFile(path===root+'/'||path===root?root+'/examples/index.html':path);res.writeHead(200,{'Content-Type':types[extname(path)]||'text/plain','Cache-Control':'no-store'});res.end(body)}catch{res.writeHead(404);res.end('Not found')}});
server.listen(port,'127.0.0.1',()=>console.log(`Demo: http://127.0.0.1:${port}/examples/index.html`));
