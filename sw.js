/* ============================================================
   htat · Service Worker — modo offline de planta
   Precarga el shell de la app (HTML, CSS, JS, lib) para que
   funcione sin conexión. Las OT se guardan en IndexedDB.
   ============================================================ */
"use strict";

const VERSION = "htat-sw-v43";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./lib/jspdf.umd.min.js",
  "./js/conf.js",
  "./js/store.js",
  "./js/signature.js",
  "./js/photos.js",
  "./js/pdf.js",
  "./js/auth.js",
  "./js/cloud.js",
  "./js/app.js",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Red-primero con respaldo en caché: estando conectado muestra siempre la
   versión más nueva (sin depender de renumerar versiones); sin conexión usa
   la última copia guardada. */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => {
        if (res.ok && (req.mode === "navigate" || url.pathname.includes("assets/") || /\.(js|css|html|png|json)$/.test(url.pathname))) {
          const clone = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match("./index.html"))
      )
  );
});