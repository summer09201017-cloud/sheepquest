// 尋羊記 SW — 網路優先、離線退快取(改版必 bump CACHE)
// v1(2026-07-28):首發
// v2(2026-07-29):⚔️ 從野獸口中搶救(獅/熊/狼節奏戰鬥,種子決定)+客廳「練習救羊」
//                 🔴 修上線至今的真 bug:#nearBar 被 CSS display:none 藏住,style.display='' 顯示不了
//                 =「帶回這隻羊」按鈕從沒出現過,等於抓不到羊
// v3(2026-07-29):⚔️ 練習救羊改「一鍵站到獸旁邊」+鎖定 _near(原本按一次還有 47m,入口不出現=以為壞了)+版本標記
// v4(2026-07-29):⚔️ 3D 回合式戰鬥舞台(three.js CDN 動態載入,載不到就降級簡易版)——牧人矩形身體+四足獸+甩杖/閃避/套索/獸逃走/帶回家 3D 動畫
const CACHE = 'sheepquest-v4';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // 圖磚/CDN 不碰
  e.respondWith((async () => {
    try {
      const r = await fetch(e.request);
      if (r.ok) (await caches.open(CACHE)).put(e.request, r.clone());
      return r;
    } catch {
      return (await caches.match(e.request)) || Response.error();
    }
  })());
});
