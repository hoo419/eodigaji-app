import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('worker bypasses private API and external requests; offline navigation gets a public fallback', async () => {
 const handlers = {};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'), {
  self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>{handlers[name]=fn;}}, URL,
  fetch:async()=>{throw Error('offline');}, caches:{match:async()=> 'offline page'},
 });
 for(const request of [{method:'GET',mode:'navigate',url:'https://example.test/api/account'},{method:'POST',mode:'cors',url:'https://example.test/api/auth/login'},{method:'GET',mode:'cors',url:'https://maps.example.test/tile'}]) {
  let intercepted=false; handlers.fetch({request,respondWith:()=>{intercepted=true;}}); assert.equal(intercepted,false);
 }
 let response; handlers.fetch({request:{method:'GET',mode:'navigate',url:'https://example.test/'},respondWith:r=>{response=r;}}); assert.equal(await response,'offline page');
});
test('PWA manifest, worker, offline page and install icons are served', async t => {
 const server=createApp({env:{}}); await new Promise(r=>server.listen(0,'127.0.0.1',r)); t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const response=await fetch(base+'/manifest.webmanifest'); assert.equal(response.status,200);
 const manifest=await response.json(); assert.equal(manifest.display,'standalone'); assert.equal(manifest.start_url,'/');
 for(const path of ['/sw.js','/pwa.js','/offline.html',...manifest.icons.map(i=>i.src)]) { const res=await fetch(base+path); assert.equal(res.status,200,path); }
 const icon=await fetch(base+'/icon-192.png'); assert.match(icon.headers.get('content-type'),/image\/png/); assert.equal((await icon.arrayBuffer()).byteLength>100,true);
});
