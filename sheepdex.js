/*! sheepdex.js — 跨站羊圈圖鑑 `hfpc-sheepdex-v1`(零相依 UMD;瀏覽器 / Node 通用)
 *
 * ★★ 這是**垂直搬運的複本**。正本 = skill `sheepdex-crossite/assets/sheepdex.js`。
 *    **請勿就地改** —— 要改先改正本,再搬到每一站(0809 立的「共用 core 鐵則」:
 *    兩站共用邏輯一律「skill 正本 + 單一檔垂直搬運」,不複製第二份實作)。
 *
 * 為什麼需要它:牧羊人與羊群 3D(sheepflock3d, pages.dev)與尋羊記(sheepquest, workers.dev)
 *   是**兩個不同 origin** ⇒ localStorage 不共用。所以「兩站的羊互通」靠的不是同一個鍵自動同步,
 *   而是**同一份資料格式**:兩站讀寫同一個 schema ⇒ 匯出的文字互相吃得下、短碼搬運只搬這一包,
 *   中間不需要任何轉檔,也沒有「哪一邊才是正確欄位名」的爭議。
 *
 * 格式(v:1;之後新增的欄位一律「選填」,對面站沒有的欄位必須能容忍):
 * {
 *   v: 1,
 *   sheep: [{
 *     id,            // 全域唯一。3D='s_<時間><亂數>' / GPS='g_<格x>_<格y>_<時段>'
 *                    //   ★ GPS 側刻意用**確定性 id**(不含亂數)⇒ 同一隻羊重複匯入不會生出第二隻。
 *     name,
 *     genes: {wool,face,spots,ears,eyes,gift,size},
 *                    //   ★ 缺了會用 genesFromSeed(id) 補 —— 兩站補出來的是**同一隻**(同種子同演算法),
 *                    //     所以 GPS 抓到的羊走進 3D 也長得一模一樣,不會每次匯入換一張臉。
 *     verse,         // 這隻羊的經文(GPS 從獸口救回=撒上17:37,其餘=路15:5)
 *     foundAt,       // 撿到的時間(ms)
 *     source,        // '3d' | 'gps' —— 圖鑑上顯示來源徽章
 *     place?,        // 撿到的地點名(GPS 版的反向地名;沒有就不顯示)
 *     lat?, lon?,    // 撿到的經緯度(GPS 版有;3D 的真實地圖漫遊也可能有)
 *     gold?,         // ✨ 金毛羊
 *     rescued?,      // 從哪隻獸口中救回來的(顯示 ⚔️)
 *     landmark?      // 🗺 真實地標名(地標任務的特別羊)
 *   }],
 *   squad:  [id × 最多 SQUAD_MAX],   // 出戰(戰鬥中支援;羊永不死)
 *   follow: [id × 最多 FOLLOW_MAX],  // 伴行(漫遊時跟在牧人身邊)
 *   updatedAt
 * }
 *
 * ★ 神學鐵則(跟著格式一起搬,免得換站就走味):羊是牧人保護與同行的羊群
 *   (約10:3-4 按名叫羊、羊跟著牧人),**不是攻擊單位**;戰鬥中羊只做支援,永遠不會死。
 */
/* UMD 掛載。★★ 兩件事都做,**不可以寫成 if/else**(0811 實錘):
 *   Vite/Rollup 打包時會把裸識別字 `module` 當外部全域處理(實測還被改名成 `_e`)並且**走了 CJS 那支**
 *   ⇒ 傳統 UMD 的 `else root.SheepDex = …` 永遠不會執行 ⇒ 取全域的那一站拿到 undefined。
 *   而那個病**建置是綠的、頁面也還畫得出選單**(靜態 HTML),但解構當場拋 TypeError ⇒ 整包 JS 全死;
 *   HTTP 200、部署驗收全綠,抓到它的只有真的開瀏覽器看 console。
 * ⇒ 先無條件掛全域,再(如果真的在 CJS 裡)給 module.exports。兩個世界都拿得到,不賭。 */
(function (root, factory) {
  var api = factory();
  if (root) root.SheepDex = api;
  if (typeof module === "object" && module && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEX_KEY = "hfpc-sheepdex-v1";
  var SQUAD_MAX = 3;
  var FOLLOW_MAX = 5;

  /* ---------- 天賦(gift)= 戰鬥支援能力,同時決定配飾外觀 ---------- */
  var GIFTS = {
    bell: { label: "鈴鐺羊", icon: "🔔", desc: "搖鈴引開野獸的注意,撲擊會慢下來" },
    wool: { label: "絨毛羊", icon: "🧣", desc: "蓬蓬的絨毛替牧人擋下一次重擊" },
    swift: { label: "快腿羊", icon: "🍯", desc: "腿快鼻靈,野地的蜂蜜更常被牠找到" },
    song: { label: "詩歌羊", icon: "🎵", desc: "咩咩唱詩,牧人的勇氣慢慢恢復" },
  };
  var GIFT_ORDER = ["bell", "wool", "swift", "song"];

  /* ---------- 基因表 ----------
     ⚠ 這幾張表的**順序就是格式的一部分**:genesFromSeed 是「用種子去索引」,
       在中間插一個顏色會讓所有既有羊換色(而且兩站不同步時會各長一張臉)。
       要加新色一律**往後接**。 */
  var WOOL_COLORS = [0xf4efe3, 0xefe3cf, 0xe8e8ee, 0xd9cbb2, 0xcbb9a2, 0x8a7a6a, 0x4a4038, 0xf2ddda];
  var FACE_COLORS = [0x3a3128, 0x6b5138, 0x2b2b30, 0x8a6a4a, 0xcaa27a];
  var SPOTS = ["none", "none", "patch", "dots"];
  var EARS = ["up", "down", "long"];
  var EYES = ["round", "sleepy", "happy"];
  /* ---------- 性別與配飾(2026-08-26 新增)----------
     使用者:「母的可以穿裙子或頭戴髮飾,公羊可以戴帽子或太陽眼鏡之類的,
              這樣明信片裡,被救的羊,就不會都長得一樣。」
     ★★ **這兩個欄位一定要抽在 randomGenes 的最後面**(見那支函式的註解):
        在中間插一次 r() 會讓後面所有欄位偏移 ⇒ **既有的羊全部換臉**。
     ★★ 而且它們是**從 id 現算的,不是靠傳輸的** —— normalizeEntry 會把 genes 整個重建,
        舊版的站(還沒更新這支檔的)會把不認識的欄位洗掉。設計成現算之後:
          · 舊站收到新羊 → 算不出 sex(它的 randomGenes 沒有)⇒ **不畫配飾,不會壞**(降級)
          · 新站收到舊羊 → 用同一個 id 現算 ⇒ 一樣有配飾
        ⇒ 兩邊都不必等對方升級,也不必動 Worker 中繼站。
     ⚠ 配飾**不影響任何玩法數值**(不像 gift 會影響戰鬥)——純外觀,才可以這樣現算。 */
  var SEXES = ["ewe", "ram"];
  var DECOS = {
    // 母羊:裙子 / 髮飾(花)/ 髮飾(蝴蝶結)/ 兩者都有
    ewe: ["skirt", "flower", "bow", "skirt+flower"],
    // 公羊:帽子 / 太陽眼鏡 / 圍巾 / 帽子+太陽眼鏡
    ram: ["hat", "shades", "scarf", "hat+shades"],
  };

  var NAME_POOL = [
    "小雪", "棉棉", "咩咩", "乖乖", "毛毛", "恩典", "平安", "喜樂", "小雲", "奶油",
    "小星", "月光", "阿寶", "糰子", "泡泡", "小福", "路得", "迦勒", "小羔", "白白",
  ];

  /* ---------- 確定性亂數(FNV-1a + mulberry32) ----------
     ★ 為什麼不用 Math.random 產 genes:羊要能在兩站之間搬來搬去。
       如果外觀是抓到那一刻隨機決定、又沒存進去(或存了但格式漂移),
       那同一隻羊在對面站就會換臉 —— 孩子會說「這不是我的小雪」。
     ★ 這兩支演算法與尋羊記 index.html 的 seedOf/rng **逐位元相同**(它的「全家同見」也靠這個),
       所以兩邊算出來的數列一致;動它等於動格式。 */
  function hashSeed(str) {
    var h = 2166136261 >>> 0;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomGenes(rand) {
    var r = typeof rand === "function" ? rand : Math.random;
    var pick = function (arr) { return arr[Math.floor(r() * arr.length)]; };
    var g = {
      wool: pick(WOOL_COLORS),
      face: pick(FACE_COLORS),
      spots: pick(SPOTS),
      ears: pick(EARS),
      eyes: pick(EYES),
      gift: pick(GIFT_ORDER),
      size: 0.88 + r() * 0.26,
    };
    /* ⚠⚠ 新欄位一律**接在這裡(最後)**,絕不插進上面那一串 ——
       每一行都消耗一次 r(),中間插一次會讓後面全部偏移 ⇒ 既有的羊整批換臉。 */
    g.sex = pick(SEXES);
    g.deco = pick(DECOS[g.sex]);
    return g;
  }

  /* 同一個種子 → 永遠同一隻羊的長相(兩站一致)。種子一律用 entry.id。 */
  function genesFromSeed(seed) {
    return randomGenes(mulberry32(hashSeed(seed)));
  }

  /* 0xf4efe3 → '#f4efe3'(給沒有 three.js 的站畫縮圖/徽章用) */
  function hexCss(n) {
    return "#" + (Number(n) >>> 0).toString(16).padStart(6, "0").slice(-6);
  }

  function pickName(rand, taken) {
    var r = typeof rand === "function" ? rand : Math.random;
    var used = taken instanceof Set ? taken : new Set(taken || []);
    var free = NAME_POOL.filter(function (n) { return !used.has(n); });
    var pool = free.length ? free : NAME_POOL;
    var base = pool[Math.floor(r() * pool.length)];
    if (!used.has(base)) return base;
    for (var i = 2; i < 99; i++) if (!used.has(base + i)) return base + i;
    return base;
  }

  /* ---------- 讀 / 寫 ---------- */
  function emptyDex() {
    return { v: 1, sheep: [], squad: [], follow: [], updatedAt: 0 };
  }

  /* 把一筆羊補成「一定畫得出來」的樣子。
     ★ 這是跨站相容的關鍵:對面站可能少給 genes(或給了半套)、可能多給我們不認識的欄位。
       少的補、怪的修、多的**原樣留著**(留著才能再搬回去不掉資料)。 */
  function normalizeEntry(s) {
    if (!s || typeof s !== "object") return null;
    var id = s.id != null ? String(s.id) : "";
    if (!id) return null;
    var out = {};
    for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) out[k] = s[k];
    out.id = id;
    out.name = s.name != null && String(s.name).trim() ? String(s.name).trim().slice(0, 24) : "小羊";
    out.source = s.source === "gps" || s.source === "3d" ? s.source : "3d";
    out.verse = s.verse ? String(s.verse).slice(0, 40) : "路15:5";
    out.foundAt = Number(s.foundAt) > 0 ? Number(s.foundAt) : 0;

    var base = genesFromSeed(id);
    var g = s.genes && typeof s.genes === "object" ? s.genes : {};
    out.genes = {
      wool: Number.isFinite(Number(g.wool)) ? Number(g.wool) : base.wool,
      face: Number.isFinite(Number(g.face)) ? Number(g.face) : base.face,
      spots: SPOTS.indexOf(g.spots) >= 0 ? g.spots : base.spots,
      ears: EARS.indexOf(g.ears) >= 0 ? g.ears : base.ears,
      eyes: EYES.indexOf(g.eyes) >= 0 ? g.eyes : base.eyes,
      gift: GIFT_ORDER.indexOf(g.gift) >= 0 ? g.gift : base.gift,
      size: Number(g.size) >= 0.5 && Number(g.size) <= 2 ? Number(g.size) : base.size,
      // 性別與配飾:對面站可能整個沒有(舊版)⇒ 一律用 id 現算的 base 補齊
      sex: SEXES.indexOf(g.sex) >= 0 ? g.sex : base.sex,
      deco: (DECOS[SEXES.indexOf(g.sex) >= 0 ? g.sex : base.sex] || []).indexOf(g.deco) >= 0 ? g.deco : base.deco,
    };
    if (s.gold) out.gold = true; else delete out.gold;
    if (s.rescued) out.rescued = String(s.rescued).slice(0, 12); else delete out.rescued;
    if (s.place) out.place = String(s.place).slice(0, 40); else delete out.place;
    if (s.landmark) out.landmark = String(s.landmark).slice(0, 40); else delete out.landmark;
    if (Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon))) {
      out.lat = Number(Number(s.lat).toFixed(5));   // 5 位小數≈1 公尺:夠標地點,又不留下過細的行蹤
      out.lon = Number(Number(s.lon).toFixed(5));
    } else { delete out.lat; delete out.lon; }
    return out;
  }

  function sanitizeDex(d) {
    if (!d || typeof d !== "object" || d.v !== 1 || !Array.isArray(d.sheep)) return null;
    var seen = new Set();
    var sheep = [];
    for (var i = 0; i < d.sheep.length; i++) {
      var e = normalizeEntry(d.sheep[i]);
      if (!e || seen.has(e.id)) continue;       // 重複 id 只留第一筆(壞匯入的自我修復)
      seen.add(e.id);
      sheep.push(e);
    }
    var keep = function (arr, max) {
      var out = [], s = new Set();
      for (var j = 0; j < (Array.isArray(arr) ? arr.length : 0) && out.length < max; j++) {
        var id = String(arr[j]);
        if (seen.has(id) && !s.has(id)) { s.add(id); out.push(id); }   // 指向不存在的羊=丟掉
      }
      return out;
    };
    return {
      v: 1,
      sheep: sheep,
      squad: keep(d.squad, SQUAD_MAX),
      follow: keep(d.follow, FOLLOW_MAX),
      updatedAt: Number(d.updatedAt) > 0 ? Number(d.updatedAt) : 0,
    };
  }

  function loadDex(storage) {
    try {
      var st = storage || localStorage;
      var raw = st.getItem(DEX_KEY);
      var d = raw ? JSON.parse(raw) : null;
      var ok = sanitizeDex(d);
      if (ok) return ok;
    } catch (e) { /* 壞檔 / 私密模式 = 重新開始,不炸 */ }
    return emptyDex();
  }

  function saveDex(dex, storage) {
    try {
      dex.updatedAt = Date.now();
      (storage || localStorage).setItem(DEX_KEY, JSON.stringify(dex));
      return true;
    } catch (e) {
      return false;   // Safari 私密模式 / 容量爆:本場有效,不炸
    }
  }

  /* ---------- 新增 ---------- */
  function newSheepId(prefix) {
    return (prefix || "s") + "_" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }

  /* GPS 側的**確定性** id:同一格同一時段的同一隻羊,算出來永遠是這個 id
     ⇒ 舊存檔回填、重複匯入、兩台手機各抓一次…都只會有一隻。 */
  function gpsSheepId(rawId) {
    return "g_" + String(rawId).replace(/[^A-Za-z0-9]+/g, "_");
  }

  /* 建一筆羊。genes 沒給就用 id 當種子算(兩站算出同一隻)。 */
  function makeEntry(opts) {
    var o = opts || {};
    var id = o.id || newSheepId(o.source === "gps" ? "g" : "s");
    var e = {
      id: id,
      name: o.name,
      genes: o.genes || genesFromSeed(id),
      verse: o.verse || "路15:5",
      foundAt: o.foundAt || Date.now(),
      source: o.source === "gps" ? "gps" : "3d",
    };
    if (o.gold) e.gold = true;
    if (o.rescued) e.rescued = o.rescued;
    if (o.place) e.place = o.place;
    if (o.landmark) e.landmark = o.landmark;
    if (o.lat != null && o.lon != null) { e.lat = o.lat; e.lon = o.lon; }
    return normalizeEntry(e);
  }

  /* 加進圖鑑(同 id 就不加,回傳既有那筆)。有空位就自動排進伴行/出戰。 */
  function addSheep(dex, entry, storage) {
    var e = normalizeEntry(entry);
    if (!e) return null;
    var have = null;
    for (var i = 0; i < dex.sheep.length; i++) if (dex.sheep[i].id === e.id) { have = dex.sheep[i]; break; }
    if (have) return have;
    dex.sheep.push(e);
    if (dex.follow.length < FOLLOW_MAX) dex.follow.push(e.id);
    if (dex.squad.length < SQUAD_MAX) dex.squad.push(e.id);
    saveDex(dex, storage);
    return e;
  }

  /* ---------- 合併 / 匯出 / 匯入 ---------- */
  /* 合併=同 id 略過(不覆寫本機的,本機才是使用者現在手上那隻)。
     回傳 {added, skipped};本機的伴行/出戰名單保留,有空位才用新羊補滿。 */
  function mergeDex(dex, incoming, storage) {
    var inc = sanitizeDex(incoming);
    if (!inc) return { added: 0, skipped: 0, ok: false };
    var have = new Set(dex.sheep.map(function (s) { return s.id; }));
    var added = 0, skipped = 0, fresh = [];
    for (var i = 0; i < inc.sheep.length; i++) {
      var s = inc.sheep[i];
      if (have.has(s.id)) { skipped++; continue; }
      have.add(s.id);
      dex.sheep.push(s);
      fresh.push(s.id);
      added++;
    }
    for (var j = 0; j < fresh.length; j++) {
      if (dex.follow.length < FOLLOW_MAX && dex.follow.indexOf(fresh[j]) < 0) dex.follow.push(fresh[j]);
      if (dex.squad.length < SQUAD_MAX && dex.squad.indexOf(fresh[j]) < 0) dex.squad.push(fresh[j]);
    }
    if (added) saveDex(dex, storage);
    return { added: added, skipped: skipped, ok: true };
  }

  function exportDexText(dex) {
    return JSON.stringify(sanitizeDex(dex) || emptyDex(), null, 1);
  }

  /* 匯入=合併。回傳新增數;壞 JSON / 格式不對回 -1(呼叫端要分得出「0 隻新的」與「檔案壞了」)。 */
  function importDexText(dex, text, storage) {
    var inc;
    try { inc = JSON.parse(String(text)); } catch (e) { return -1; }
    var r = mergeDex(dex, inc, storage);
    return r.ok ? r.added : -1;
  }

  function dexStats(dex) {
    var d = sanitizeDex(dex) || emptyDex();
    var gps = 0, gold = 0, rescued = 0, landmark = 0;
    for (var i = 0; i < d.sheep.length; i++) {
      var s = d.sheep[i];
      if (s.source === "gps") gps++;
      if (s.gold) gold++;
      if (s.rescued) rescued++;
      if (s.landmark) landmark++;
    }
    return { total: d.sheep.length, gps: gps, threeD: d.sheep.length - gps, gold: gold, rescued: rescued, landmark: landmark };
  }

  return {
    DEX_KEY: DEX_KEY, SQUAD_MAX: SQUAD_MAX, FOLLOW_MAX: FOLLOW_MAX,
    GIFTS: GIFTS, GIFT_ORDER: GIFT_ORDER, NAME_POOL: NAME_POOL,
    SEXES: SEXES, DECOS: DECOS,
    WOOL_COLORS: WOOL_COLORS, FACE_COLORS: FACE_COLORS, SPOTS: SPOTS, EARS: EARS, EYES: EYES,
    hashSeed: hashSeed, mulberry32: mulberry32, randomGenes: randomGenes, genesFromSeed: genesFromSeed,
    hexCss: hexCss, pickName: pickName,
    emptyDex: emptyDex, normalizeEntry: normalizeEntry, sanitizeDex: sanitizeDex,
    loadDex: loadDex, saveDex: saveDex,
    newSheepId: newSheepId, gpsSheepId: gpsSheepId, makeEntry: makeEntry, addSheep: addSheep,
    mergeDex: mergeDex, exportDexText: exportDexText, importDexText: importDexText, dexStats: dexStats,
  };
});
