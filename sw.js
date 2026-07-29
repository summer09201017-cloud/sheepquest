// 尋羊記 SW — 網路優先、離線退快取(改版必 bump CACHE)
// v1(2026-07-28):首發
// v2(2026-07-29):⚔️ 從野獸口中搶救(獅/熊/狼節奏戰鬥,種子決定)+客廳「練習救羊」
//                 🔴 修上線至今的真 bug:#nearBar 被 CSS display:none 藏住,style.display='' 顯示不了
//                 =「帶回這隻羊」按鈕從沒出現過,等於抓不到羊
// v3(2026-07-29):⚔️ 練習救羊改「一鍵站到獸旁邊」+鎖定 _near(原本按一次還有 47m,入口不出現=以為壞了)+版本標記
// v4(2026-07-29):⚔️ 3D 回合式戰鬥舞台(three.js CDN 動態載入,載不到就降級簡易版)——牧人矩形身體+四足獸+甩杖/閃避/套索/獸逃走/帶回家 3D 動畫
// v5(2026-07-29):日期修正版(開場版本標記與註解 07-30 → 07-29;功能同 v4)
// v6(2026-07-30):使用者退件五修——①羊不再屁股對螢幕(四處 rotation.y 全錯,改用具名常數 SHEEP_FACE)
//                 ②羊補尾巴+三獸尾巴加粗並做成會擺動的關節(原本細如牙籤又被身體擋住)
//                 ③牧人頭髮蓋住額頭(補頭頂帽片+瀏海;仍守「耳前無髮」與「眉毛看得見」)
//                 ④3D 戰鬥畫面可放大成劇場模式/真全螢幕(控制列留在下方才玩得動)
//                 ⑤🔊 中文朗讀(這支從頭到尾一句都沒有):過關/救回/滿百唸經文+開場「聽經文」+可關可記
//                 🔴 順手修三個真 bug(Playwright 全流程實測抓到,不是這輪新增的):
//                    ·「猛按」會讓 trust 衝到 4 → '🤍'.repeat(-1) 丟 RangeError,過關經文還被唸 4 次
//                      (離線簡易版最容易踩:沒有 3D 動畫擋輸入)→ 過關後鎖 phase='done' + 夾住愛心數
//                    · hook #25 攔到 #b3dHint 用 style.display='' 還原(劇場模式下會永遠不出現)
//                    · 開場經文出處錯:「一個人若有一百隻羊,一隻走迷了路」其實是**太 18:12**,
//                      後半才是路 15:5,卻整句標成路 15:4-6 → 已用 cuv 查驗改成路 15:4-5 逐字原文
const CACHE = 'sheepquest-v6b';
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
