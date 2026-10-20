const CACHE='fundsentinel-shell-v0.1.0';
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/icon.svg','/manifest.webmanifest'])));});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
// Never cache authenticated responses, financial data, OCR images or tokens.
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(u.origin===self.location.origin&&['/icon.svg','/manifest.webmanifest'].includes(u.pathname))event.respondWith(caches.match(event.request).then(r=>r||fetch(event.request)));});
