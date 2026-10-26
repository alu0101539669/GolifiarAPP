const CACHE_NAME = 'golifiar-v15';
const CACHE_COMPARTIDO = 'golifiar-compartido';
const APP_SHELL = [
  './',
  './index.html',
  './perfil.js',
  './motion.js',
  './inicio.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './vendor/jszip.min.js',
  './vendor/zip-inflate.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME && key !== CACHE_COMPARTIDO).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

// «Compartir con Golifiar»: el sistema envía el ZIP por POST. Se guarda en una caché
// temporal y se redirige a la página, que lo lee y lo borra. No sale del dispositivo.
async function recibirCompartido(request) {
  const destino = n => new URL('./?compartido=' + n, self.registration.scope).href;
  try {
    const form = await request.formData();
    const archivos = form.getAll('zips').filter(f => f && typeof f === 'object' && f.name);
    const cache = await caches.open(CACHE_COMPARTIDO);
    for (const clave of await cache.keys()) await cache.delete(clave);
    let i = 0;
    for (const f of archivos) {
      const url = new URL('./compartido/' + (i++) + '/' + encodeURIComponent(f.name), self.registration.scope).href;
      await cache.put(url, new Response(f, { headers: { 'Content-Type': 'application/zip' } }));
    }
    return Response.redirect(destino(archivos.length || 'error'), 303);
  } catch (e) {
    return Response.redirect(destino('error'), 303);
  }
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(recibirCompartido(event.request));
    return;
  }
  if (event.request.method !== 'GET') return;
  // Archivos del usuario recibidos por la app nativa: nunca se interceptan ni se guardan en caché
  if (url.pathname.startsWith('/_capacitor_file_/') || url.pathname.includes('/compartido/')) return;
  // Red primero (así las actualizaciones llegan siempre) y caché como respaldo sin conexión
  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request, { ignoreSearch: true }).then(c => c || caches.match('./index.html')))
  );
});
