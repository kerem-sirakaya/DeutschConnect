import { createHash } from 'node:crypto';

export function offlineBuild() {
  return { name:'deutschconnect-offline', apply:'build', generateBundle(options,bundle) {
    const paths = ['./','./index.html','./favicon.svg',...Object.keys(bundle).filter((name) => /\.(js|css|woff2?|svg|png)$/.test(name)).map((name) => './'+name)];
    const version = createHash('sha256').update(JSON.stringify(paths)).digest('hex').slice(0,12);
    const source = `const CACHE='deutschconnect-games-${version}';
const PATHS=${JSON.stringify(paths)};
const URLS=PATHS.map(path=>new URL(path,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(URLS);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('deutschconnect-games-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET'||request.headers.has('Authorization'))return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;const allowed=URLS.find(value=>new URL(value).pathname===url.pathname);if(!allowed)return;event.respondWith((async()=>{try{return await fetch(request);}catch{const cached=await(await caches.open(CACHE)).match(allowed);return cached||Response.error();}})());});
self.addEventListener('message',event=>{if(event.data?.type!=='VERIFY_CACHE')return;event.waitUntil((async()=>{const cache=await caches.open(CACHE);const complete=(await Promise.all(URLS.map(url=>cache.match(url)))).every(Boolean);event.ports[0]?.postMessage({complete});})());});
`;
    this.emitFile({ type:'asset', fileName:'sw.js', source });
    this.emitFile({ type:'asset', fileName:'offline-manifest.json', source:JSON.stringify({ version, paths },null,2) });
  } };
}
