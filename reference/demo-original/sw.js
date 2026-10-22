/* RotaCerta: versioned, scope-isolated cache of public demo assets only.
   Bump BUILD whenever any asset changes. No requests to Vision/WhatsApp exist. */
'use strict';
const BUILD = '1.0.0';
const BASE = new URL('./', self.location.href);
const PREFIX = 'rotacerta-pwa:' + encodeURIComponent(BASE.pathname) + ':';
const CACHE = PREFIX + BUILD;
const ASSET_PATHS = [
  'index.html','pwa.css','pwa.js','manifest.webmanifest',
  'icons/icon.svg','icons/icon-192.png','icons/icon-512.png',
  'icons/icon-maskable-512.png','icons/apple-touch-icon.png'
];
const ASSETS = ASSET_PATHS.map(path => new URL(path, BASE).href);
const INDEX = new URL('index.html', BASE).href;

self.addEventListener('install', event => {
  // A failed download prevents activation of this version, preserving the old one.
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(ASSETS.map(url => new Request(url, {cache:'reload'})))
  ));
  // No automatic skipWaiting: don't interrupt an attendant during a live demo.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ROTACERTA_ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const cleanURL = url.origin + url.pathname;
  const isEntry = request.mode === 'navigate' && (url.pathname === BASE.pathname || cleanURL === INDEX);
  const key = isEntry ? INDEX : cleanURL;
  if (!isEntry && !ASSETS.includes(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(key);
    if (saved) return saved;
    try {
      const response = await fetch(new Request(key, {cache:'no-cache'}));
      if (response.ok && response.type === 'basic') await cache.put(key,response.clone());
      return response;
    } catch (_) {
      if (isEntry) return new Response('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RotaCerta</title><body><h1>Conecte-se para abrir o RotaCerta.</h1><p>O navegador ainda não tem uma cópia disponível da demonstração. Abra com internet e tente novamente.</p></body></html>', {status:503,headers:{'Content-Type':'text/html; charset=utf-8'}});
      return Response.error();
    }
  })());
});
