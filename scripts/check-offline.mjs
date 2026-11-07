import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the built worker against the actual built files, then disable its
// network. This does not replace a real browser/service-worker lifecycle test.
const source = readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8');
const manifest = JSON.parse(readFileSync(new URL('../dist/offline-manifest.json',import.meta.url),'utf8'));
const origin='https://deutschconnect.example/', files=new Map();
for(const path of manifest.paths) {
  const name=path==='./' ? 'index.html' : path.slice(2);
  files.set(new URL(path,origin).href,readFileSync(new URL('../dist/'+name,import.meta.url)));
}
let online=true; const handlers={},stores=new Map();
const network=async(request)=>{if(!online)throw new Error('offline');const key=typeof request==='string'?request:request.url; const bytes=files.get(key);if(!bytes)return new Response('missing',{status:404});return new Response(bytes);};
const caches={
  async open(name){if(!stores.has(name))stores.set(name,new Map());const map=stores.get(name);return{async addAll(urls){for(const url of urls){const response=await network(url);if(!response.ok)throw new Error('cache-failed');map.set(url,response);}},async match(value){return map.get(typeof value==='string'?value:value.url)?.clone();}};},
  async keys(){return[...stores.keys()];},async delete(key){return stores.delete(key);}
};
const self={registration:{scope:origin},location:{origin:new URL(origin).origin},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(type,handler)=>handlers[type]=handler};
vm.runInNewContext(source,{self,caches,fetch:network,URL,Response},{timeout:1000});
async function life(type){let pending;handlers[type]({waitUntil:(p)=>pending=p});await pending;}
await life('install');await life('activate');online=false;
for(const [url,bytes]of files){let response;handlers.fetch({request:new Request(url),respondWith:(p)=>response=p});assert.ok(response,'cached resource is handled: '+url);assert.deepEqual(Buffer.from(await(await response).arrayBuffer()),bytes,'offline resource contents: '+url);}
for(const request of [new Request(origin+'auth/v1/user'),new Request(origin,{headers:{Authorization:'Bearer private'}}),new Request('https://other.example/file.js'),new Request(origin,{method:'POST',body:'private'})]){let handled=false;handlers.fetch({request,respondWith:()=>handled=true});assert.equal(handled,false,'private and unrelated requests must never use this cache');}
let confirmation,pending;handlers.message({data:{type:'VERIFY_CACHE'},ports:[{postMessage:(data)=>confirmation=data}],waitUntil:(p)=>pending=p});await pending;assert.equal(confirmation.complete,true);
console.log('Offline worker served '+files.size+' built resources with its network disabled; private/API requests were excluded.');
