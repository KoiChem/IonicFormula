const CACHE_NAME = "ionic-formula-v41";
const APP_SHELL = [
  "./",
  "./index.html",
  "./admin.html",
  "./soundtest.html",
  "./styles.css",
  "./styles.css?v=20261009-prompt-fit-v1",
  "./admin.css",
  "./admin.css?v=20261009-prompt-fit-v1",
  "./soundtest.css",
  "./js/app.js",
  "./js/app.js?v=20261009-prompt-fit-v1",
  "./js/admin.js",
  "./js/admin.js?v=20261009-prompt-fit-v1",
  "./js/soundtest.js",
  "./js/core.js",
  "./js/core.js?v=20261009-prompt-fit-v1",
  "./js/formula-keyboard-gesture.js",
  "./js/formula-keyboard-gesture.js?v=20261009-prompt-fit-v1",
  "./js/admin-lock.js",
  "./js/admin-lock.js?v=20261009-prompt-fit-v1",
  "./js/admin-search.js",
  "./js/admin-search.js?v=20261009-prompt-fit-v1",
  "./js/data-migrations.js",
  "./js/data-migrations.js?v=20261009-prompt-fit-v1",
  "./js/chemistry/complex-policy.js",
  "./js/chemistry/complex-policy.js?v=20261009-prompt-fit-v1",
  "./js/chemistry/formula-syntax.js",
  "./js/chemistry/formula-syntax.js?v=20261009-prompt-fit-v1",
  "./js/question-profile.js",
  "./js/question-profile.js?v=20261009-prompt-fit-v1",
  "./js/github-profile.js",
  "./js/github-profile.js?v=20261009-prompt-fit-v1",
  "./js/profile-storage.js",
  "./js/profile-storage.js?v=20261009-prompt-fit-v1",
  "./data/question-profile.json",
  "./data/chemistry-metadata.json",
  "./data/complex-chemistry.json",
  "./data/ions.json",
  "./data/compounds.json",
  "./data/difficulty.json",
  "./assets/icon.svg",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request)
    .then((response) => {
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })
    .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("./index.html"))));
});
