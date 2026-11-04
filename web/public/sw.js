// NexoT: permite abrir la plataforma sin señal para seguir registrando.
// - Páginas: primero la red; si no hay, la última versión guardada.
// - Archivos de la app (/assets): se guardan al usarlos (no cambian nunca).
// - Catálogo y perfil (localidades, puestos, perfil, organización, líderes):
//   primero la red; sin señal, la última respuesta guardada.
// Nada más se guarda: ni personas ni resultados. Al cerrar sesión se borra.
const APP = 'nexot-app-v1';
const DATOS = 'nexot-datos';
const CATALOGO = /\/rest\/v1\/(localidades|puestos|municipios|perfiles|organizaciones|lideres)\b/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== APP && k !== DATOS) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function redPrimero(req, cache, clave) {
  try {
    const r = await fetch(req);
    if (r.ok) (await caches.open(cache)).put(clave ?? req, r.clone());
    return r;
  } catch (e) {
    const guardada = await caches.match(clave ?? req, { cacheName: cache });
    if (guardada) return guardada;
    throw e;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    e.respondWith(redPrimero(req, APP, '/'));
    return;
  }
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req, { cacheName: APP }).then((g) => g ?? fetch(req).then((r) => {
      if (r.ok) caches.open(APP).then((c) => c.put(req, r.clone()));
      return r;
    })));
    return;
  }
  if (CATALOGO.test(url.pathname)) e.respondWith(redPrimero(req, DATOS));
});
