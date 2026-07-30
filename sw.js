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
// v7(2026-07-30):🔊 朗讀改成**預烤「曉臻」人聲 mp3**,並把**經文出處也唸出來**
//                 (使用者第二次拍板的鐵律;v6 用 Web Speech 機器聲被退件)。
//                 Web Speech 整段拔除,沒有機器聲退路——缺 mp3 就不唸。
//                 已立守門 hook #27 scripture-voice-guard:以後在任何專案寫 speechSynthesis、
//                 或經文朗讀沒唸出「…章…節」,寫檔當下就會被擋。
// v8(2026-07-30):🧸 羊/獅/熊/狼改成 **3D tsum 圓萌造型**(圓團身體+短胖四肢+大眼水潤雙高光+
//                 深笑+腮紅;眨眼與 Q 彈呼吸,每隻眨眼週期刻意錯開不同步)
//                 + 🏞 **3D 戰鬥背景跟著真實地點換**(6 種通用場景 + 淡江大橋/喬治高職兩個招牌地標;
//                 走路時就先查好,開打不卡;客廳模式可手動選場景示範)
//                 隱私:只送粗化到約 1 公里方格的中心點、同一帶只查一次、可用開關整個關掉;
//                 ★ 開場隱私文案已同步改成實話(原本寫「位置絕不上傳」,加了查地名就不再是實話)。
// v9(2026-07-30):🗺 **真實地圖鋪成 3D 地面**(OSM 圖磚;老師可選「草地 / 真實地圖」)——
//                 這才是皮克敏那種「這就是我家附近」的正解(皮克敏用的是**地圖**不是照片)。
//                 圖磚降彩度提亮、邊緣淡出成草地綠、非同步載入(載不到就維持草地,開打不卡);
//                 地圖開著時**地上的積木裝飾(馬路/跑道/步道)自動讓位**,不把同一條路畫兩次。
//                 用 OSM 圖磚必須標示來源 → 戰鬥畫面下方顯示「🗺 腳下的地圖 © OpenStreetMap」。
//                 + 📷 **照片背景(可選)**:把自己拍的照片存成 photos/<場景>.jpg 就自動接上,
//                 檔案不存在就退回積木(**絕不拿假圖冒充「你們那座橋」騙孩子**);
//                 照片一律壓暗、降彩度、上緣淡出成天空色 = 退成氛圍,不跟紅色攻擊線搶。
//                 客廳模式「🏞 背景」下拉有「📷 照片版示範(程式畫的假圖)」可先看效果。
const CACHE = 'sheepquest-v9';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg',
  // 人聲經文:一定要進 CORE,否則離線時「有朗讀鈕、沒有聲音」
  './voice/luke15-4-5.mp3', './voice/luke15-5.mp3', './voice/luke15-6.mp3',
  './voice/1sam17-37.mp3', './voice/voice-on.mp3'];
// ⚠ 刻意**不**把 photos/*.jpg 放進 CORE:addAll 只要有一個檔 404,整個 SW 安裝就失敗,
//   而照片是「有才用」的選配。真的放了照片、又想離線也能用,再自己把檔名加進 CORE。

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
