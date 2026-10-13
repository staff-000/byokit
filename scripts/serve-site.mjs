import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve(new URL('../dist/site',import.meta.url).pathname),port=Number(process.env.BYOKIT_SITE_PORT||4174);
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname==='/byokit') {res.writeHead(302,{Location:'/byokit/'});res.end();return}if(!pathname.startsWith('/byokit/'))throw new Error();pathname=pathname.slice('/byokit'.length);if(pathname.endsWith('/'))pathname+='index.html';const file=resolve(root,'.'+pathname);if(!file.startsWith(root+'/'))throw new Error();const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(body)}catch{res.writeHead(404);res.end('Not found')}});
server.listen(port,'127.0.0.1',()=>console.log(`Website: http://127.0.0.1:${port}/byokit/`));
