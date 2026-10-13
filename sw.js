// hk-1016 오프라인 캐시 (A안: 앱 껍데기 + 지도 라이브러리·글꼴만 저장, 지도 바탕 타일은 저장하지 않음)
// VERSION 은 배포할 때 encrypt.mjs(로컬 미리보기는 build.mjs)가 채운다 → 값이 바뀌면 새 캐시로 갈아탄다.
const VERSION = "2026-10-14 08:42 KST";
const CACHE = "hk1016-" + VERSION;

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js",
  "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Noto+Sans+TC:wght@900&display=swap",
];

// 저장해 두는 곳: 우리 사이트 + 지도 라이브러리(cdnjs) + 구글 글꼴
const SAVE = h => h === self.location.hostname || h === "cdnjs.cloudflare.com" || h === "fonts.googleapis.com" || h === "fonts.gstatic.com";

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 한 개가 실패해도 설치는 계속 (예: 글꼴 CDN 일시 장애)
    await Promise.all(SHELL.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k.startsWith("hk1016-")) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 지도 바탕 타일은 저장하지 않는다 (A안) — 온라인일 때만 보인다
  if (url.hostname.endsWith("tile.openstreetmap.org")) return;

  // 페이지 열기: 인터넷이 되면 새 배포본, 안 되면 저장해 둔 것
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        if (net && net.ok) (await caches.open(CACHE)).put("./index.html", net.clone());
        return net;
      } catch (err) {
        const c = await caches.open(CACHE);
        return (await c.match("./index.html")) || (await c.match("./")) || Response.error();
      }
    })());
    return;
  }

  if (!SAVE(url.hostname)) return;

  // 나머지(라이브러리·글꼴·아이콘): 저장해 둔 것 먼저, 뒤에서 조용히 갱신
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    if (hit) {
      fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); }).catch(() => {});
      return hit;
    }
    try {
      const net = await fetch(req);
      if (net && (net.ok || net.type === "opaque")) c.put(req, net.clone());
      return net;
    } catch (err) {
      return Response.error();
    }
  })());
});
