// CI-only browser smoke with intercepted inference; never uses real API credentials.
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
const server=spawn(process.execPath,['scripts/serve-site.mjs'],{stdio:'pipe'});
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{if(String(data).includes('Website:'))resolve()});server.on('exit',()=>reject(new Error('Preview server exited before readiness.')));server.on('error',reject)});
 const smoke=spawn(process.execPath,['scripts/site-smoke.mjs'],{stdio:'inherit',env:{...process.env,BYOKIT_CHROME:chromium.executablePath()}});
 const code=await new Promise((resolve,reject)=>{smoke.on('exit',resolve);smoke.on('error',reject)});if(code!==0)throw new Error('Browser smoke failed.');
}finally{server.kill('SIGTERM');}
