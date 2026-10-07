// Service worker de Cyberwar 3D: permite instalarlo como app y jugar sin conexión
// (la primera vez necesita red para bajar Three.js; después queda en caché).
const CACHE='cyberwar-3d-v5';
const CORE=['index.html','manifest.webmanifest','qrcode.min.js','jsqr.min.js','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(CORE.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('cyberwar-3d-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  const same=url.origin===self.location.origin;
  // Páginas: red primero (para recibir actualizaciones), caché si no hay conexión.
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put('index.html',cp));return r}).catch(()=>caches.match('index.html')));
    return;
  }
  // Three.js y fuentes (otros orígenes) y estáticos propios: caché primero, y se refresca en segundo plano.
  const ok=same||/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url.host);
  if(!ok)return;
  e.respondWith(caches.open(CACHE).then(c=>c.match(req).then(hit=>{
    const net=fetch(req).then(r=>{if(r&&(r.ok||r.type==='opaque'))c.put(req,r.clone());return r}).catch(()=>hit);
    return hit||net;
  })));
});
