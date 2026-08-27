/*! pedometer.js — 跨站計步(皮克敏式;零相依 UMD;瀏覽器 / Node 通用)
 *
 * ★★ 正本 = skill `step-pedometer/assets/pedometer.js`。各站是**垂直搬運的複本**,
 *    **請勿就地改** —— 要改先改正本再搬到每一站,三份 md5 必須逐位元相同
 *    (0809 立的共用 core 鐵則,同 sheepdex.js)。
 *
 * ⚠⚠ 前提先講清楚,不要對使用者說謊:
 *   ① **web 沒有計步 API**。手機系統的計步器(HealthKit / Google Fit)網頁拿不到。
 *      這支是用 devicemotion 的加速度自己數峰值 ⇒ 一定比系統計步器不準。
 *   ② **iOS 必須由使用者手勢觸發授權**(DeviceMotionEvent.requestPermission)——
 *      不能在載入時自己要,一定要接在一顆真的按鈕上。
 *   ③ **LINE / FB / IG 的內建瀏覽器會擋 sensor**(教會的連結都走 LINE 發)⇒
 *      這是**改設定也沒用**的,唯一的路是「用外部瀏覽器開啟」。見 skill in-app-browser-guard。
 *   ④ **頁面切到背景就不再收到 devicemotion** ⇒ 鎖屏走路不會被算到。
 *      這是平台限制不是 bug;所以本支一律**寧可少算不多算**,並在 UI 上誠實說明。
 *   ⇒ 因此設計成**雙軌**:拿不到動作感測就退回「GPS 位移 ÷ 步幅」估算(標明是估算)。
 *
 * ★ 誠實性規則(這是本支最重要的部分,比演算法重要):
 *   · 兩軌**不相加**。motion 可用時完全忽略 GPS 估算,否則會 double count。
 *   · 步頻理智夾:同一步之間至少 MIN_STEP_MS(甩手機刷步數會被吃掉大半)。
 *   · GPS 估算要過精度閘,而且**單點位移上限** —— 定位跳點在城市裡很常見,
 *     不夾住會一次冒出幾千步。
 *   · 存的是**每日桶**(YYYY-MM-DD → 步數)不是一個總數 ⇒ 可畫熱圖、可回溯,
 *     而且哪天算錯只壞一天。
 *
 * 自測(不需要手機):node pedometer.js --selftest
 */
(function (root, factory) {
  var api = factory();
  /* ⚠ 先**無條件**掛全域,再另一行給 module.exports —— 不可以寫成 else。
     打包工具會把裸識別字 module 當外部全域並走 CJS 那一支 ⇒ else 永遠不執行
     ⇒ 取全域的那一站拿到 undefined(bundler-global-guard #37 實錄)。 */
  if (root) root.Pedometer = api;
  if (typeof module === "object" && module && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STATE_V = 1;
  var MIN_STEP_MS = 240;      // 兩步之間最短間隔(每分鐘 250 步以上的都不算人走路)
  var MAX_STEP_MS = 2200;     // 超過這麼久沒有下一步就重新起算節奏
  var STRIDE_M = 0.72;        // 估算用步幅(成人平均;只有 GPS 軌用得到)
  var GPS_MAX_ACC = 35;       // 精度比這個差的定位點丟掉(公尺)
  var GPS_MAX_JUMP_M = 60;    // 單點位移上限:定位跳點不夾住會冒出幾千步
  var KEEP_DAYS = 400;
  var WARMUP_SAMPLES = 12;    // 先養基線再數步(不然一按開始就先送幾步)
  var STEP_THRESH = 1.05;     // m/s^2:動態分量要超過這個才算一步的候選峰
  var DAY_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

  function todayKey(now) { return new Date(now).toISOString().slice(0, 10); }
  function emptyState() { return { v: STATE_V, days: {}, mode: null, since: null }; }

  function normalize(raw) {
    var s = emptyState();
    if (!raw || typeof raw !== "object") return s;
    if (raw.days && typeof raw.days === "object") {
      for (var k in raw.days) {
        if (!Object.prototype.hasOwnProperty.call(raw.days, k)) continue;
        if (!DAY_RE.test(k)) continue;
        var v = Math.floor(Number(raw.days[k]));
        if (isFinite(v) && v > 0) s.days[k] = v;
      }
    }
    s.mode = typeof raw.mode === "string" ? raw.mode : null;
    s.since = typeof raw.since === "number" ? raw.since : null;
    return s;
  }

  function prune(days) {
    var keys = Object.keys(days).sort();
    while (keys.length > KEEP_DAYS) delete days[keys.shift()];
    return days;
  }

  /* 統計:今天 / 近 7 天 / 總計 / 連續天數。
     ⚠ 連續天數要從**今天或昨天**起算 —— 只認今天的話,還沒出門就顯示中斷=天天嚇人。 */
  function statsOf(state, now) {
    var days = state.days, tk = todayKey(now), total = 0, week = 0, i, j, k;
    for (k in days) if (Object.prototype.hasOwnProperty.call(days, k)) total += days[k];
    for (i = 0; i < 7; i++) week += days[todayKey(now - i * 86400000)] || 0;
    var streak = 0;
    var start = (days[tk] || 0) > 0 ? 0 : 1;
    for (j = start; j < KEEP_DAYS; j++) {
      if ((days[todayKey(now - j * 86400000)] || 0) > 0) streak++; else break;
    }
    return { today: days[tk] || 0, week: week, total: total, streak: streak, mode: state.mode, days: days };
  }

  /* 內建瀏覽器偵測(LINE / FB / IG)。判準保守:寧可漏判,也不要把正常 Chrome 說成內建瀏覽器。 */
  function inAppBrowser(ua) {
    var u = String(ua || "").toLowerCase();
    if (u.indexOf("line/") >= 0) return "LINE";
    if (u.indexOf("fban") >= 0 || u.indexOf("fbav") >= 0) return "Facebook";
    if (u.indexOf("instagram") >= 0) return "Instagram";
    return null;
  }

  function haversine(a, b) {
    var R = 6371000, toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad, dLon = (b.lon - a.lon) * toRad;
    var la1 = a.lat * toRad, la2 = b.lat * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
          + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* ══════════════════════════════════════════════════════════════════════════
     🏆 步數里程碑 —— 0827 使用者拍板「步數換獎勵」,由 AI 決定形狀
     ══════════════════════════════════════════════════════════════════════════
     ★ 為什麼是「解鎖經文 + 彩帶」而不是「走 N 步孵一隻羊」:
       ① 孵羊會**跟核心玩法打架** —— 尋羊記的羊是走到那個地點才找到的(路15:4
          「去找那失去的羊」),走路本身就是那套神學;再加一條「走路自動生羊」
          會讓「出門去找」失去意義,也會弄壞既有的出現率平衡。
       ② **既有引擎可以直接收割**:尋羊記已經有里程碑機制(彩帶+金句+紀念章,
          慶祝去重記在存檔裡),步數台階走同一套,不新建第二套。
     ★ 經文全部 **cuv 逐字查驗**過(mcp__cuv__lookup),並照本系列慣例把全形標點
       正規化成半形(與既有 MILESTONES 一致)。`say` 是唸稿:不帶標點、出處寫成中文數字
       —— 朗讀一定要把章節出處也唸出來(scripture-voice-guard #27)。
     ★ 台階串成一條敘事線:走義路 → 有光 → 不疲乏 → 與神同行 → 以諾同行 → 耶穌同行。 */
  var STEP_MILESTONES = [
    { n: 1000, em: "👣", ref: "詩 23:3",
      verse: "「他使我的靈魂甦醒,為自己的名引導我走義路。」——詩篇 23:3",
      say: "他使我的靈魂甦醒,為自己的名引導我走義路。詩篇二十三篇三節。",
      word: "一千步!牧人領你走的每一步,都是義路。" },
    { n: 5000, em: "🕯", ref: "詩 119:105",
      verse: "「你的話是我腳前的燈,是我路上的光。」——詩篇 119:105",
      say: "你的話是我腳前的燈,是我路上的光。詩篇一百一十九篇一百零五節。",
      word: "五千步!前面的路有光,你不是自己在摸黑走。" },
    { n: 15000, em: "🦅", ref: "賽 40:31",
      verse: "「他們奔跑卻不困倦,行走卻不疲乏。」——以賽亞書 40:31",
      say: "他們奔跑卻不困倦,行走卻不疲乏。以賽亞書四十章三十一節。",
      word: "一萬五千步!等候耶和華的人,行走卻不疲乏。" },
    { n: 30000, em: "🤝", ref: "彌 6:8",
      verse: "「只要你行公義,好憐憫,存謙卑的心,與你的神同行。」——彌迦書 6:8",
      say: "只要你行公義,好憐憫,存謙卑的心,與你的神同行。彌迦書六章八節。",
      word: "三萬步!走路不只是走路——是與神同行。" },
    { n: 60000, em: "🌟", ref: "創 5:24",
      verse: "「以諾與神同行」——創世記 5:24",
      say: "以諾與神同行。創世記五章二十四節。",
      word: "六萬步!以諾就是這樣一天一天走出來的。" },
    { n: 100000, em: "🎊", ref: "路 24:15",
      verse: "「耶穌親自就近他們,和他們同行」——路加福音 24:15",
      say: "耶穌親自就近他們,和他們同行。路加福音二十四章十五節。",
      word: "十萬步!你以為只有自己在走,主一直就走在旁邊。" },
  ];

  /* 該慶祝哪一個台階?`done` = 已慶祝過的台階(物件或陣列都吃)。
     ★ 用「>= n 且沒慶祝過」而不是「=== n」——步數是一次跳好幾步的(GPS 軌一次補幾十步),
       用等號比對的話台階會被跳過去,而且**不會有任何錯誤訊息**。
       (尋羊記 0826 在羊數上踩過同一條,註解就寫在它的 milestoneHit 旁邊。) */
  function milestoneDue(total, done) {
    var has = function (n) {
      if (!done) return false;
      if (Array.isArray(done)) return done.indexOf(n) >= 0;
      return !!done[n];
    };
    for (var i = 0; i < STEP_MILESTONES.length; i++) {
      var m = STEP_MILESTONES[i];
      if (total >= m.n && !has(m.n)) return m;
    }
    return null;
  }

  /* 下一個台階與還差幾步(UI 用:「還差 N 步到下一段金句」比一個乾巴巴的總數有黏著力) */
  function nextMilestone(total) {
    for (var i = 0; i < STEP_MILESTONES.length; i++) {
      if (total < STEP_MILESTONES[i].n) {
        return { m: STEP_MILESTONES[i], remain: STEP_MILESTONES[i].n - total };
      }
    }
    return null;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     🗓 格子熱圖的資料(與 reading-footprint 的每日桶同構,那邊的畫法可以直接收割)
     ══════════════════════════════════════════════════════════════════════════
     回傳 { weeks: [[cell…]…], max, days, total },cell = {date, steps, level(0~4), future}
     ★ 週一律**從星期日開始**對齊,並且補滿前後空格 —— 不補的話第一週會歪掉,
       而歪掉的熱圖看起來像資料錯了。
     ★ level 用**分位數**不是固定門檻:每個人的步數級距差十倍,固定門檻會讓
       走得少的人整張圖全白、走得多的人整張圖全滿(兩種都等於沒資訊)。 */
  function heatmap(state, days, now) {
    days = days || 182;
    now = now || Date.now();
    var todayIso = todayKey(now);
    var cells = [];
    var vals = [];
    for (var i = days - 1; i >= 0; i--) {
      var iso = todayKey(now - i * 86400000);
      var v = state.days[iso] || 0;
      cells.push({ date: iso, steps: v, level: 0, future: false });
      if (v > 0) vals.push(v);
    }
    vals.sort(function (a, b) { return a - b; });
    var q = function (p) { return vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * p))] : 0; };
    var q1 = q(0.25), q2 = q(0.5), q3 = q(0.75);
    for (var j = 0; j < cells.length; j++) {
      var s = cells[j].steps;
      cells[j].level = s <= 0 ? 0 : s <= q1 ? 1 : s <= q2 ? 2 : s <= q3 ? 3 : 4;
    }
    // 前面補空格,讓第一格落在它真正的星期幾
    var firstDow = new Date(cells[0].date + "T00:00:00Z").getUTCDay();
    var padded = [];
    for (var p = 0; p < firstDow; p++) padded.push(null);
    padded = padded.concat(cells);
    while (padded.length % 7 !== 0) padded.push(null);
    var weeks = [];
    for (var w = 0; w < padded.length; w += 7) weeks.push(padded.slice(w, w + 7));
    var total = 0;
    for (var t = 0; t < cells.length; t++) total += cells[t].steps;
    return { weeks: weeks, max: vals.length ? vals[vals.length - 1] : 0, days: days, total: total, todayIso: todayIso };
  }

  /* 本月 / 近 N 月的加總(UI 的「本月 / 近 3 月 / 近 12 月」用) */
  function rangeTotal(state, months, now) {
    now = now || Date.now();
    var cut = new Date(now);
    cut.setUTCMonth(cut.getUTCMonth() - (months - 1));
    cut.setUTCDate(1);
    var cutIso = cut.toISOString().slice(0, 10);
    var sum = 0;
    for (var k in state.days) {
      if (!Object.prototype.hasOwnProperty.call(state.days, k)) continue;
      if (k >= cutIso) sum += state.days[k];
    }
    return sum;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     🖼 月報分享卡(直式 PNG;canvas 2D、零相依、可離線)
     ══════════════════════════════════════════════════════════════════════════
     ★ 範式同 [[share-card]] / reading-footprint §7:直式、大字、日曆熱圖 + 統計 + 一句金句。
     ⚠ 卡上的金句一律用**已經 cuv 查驗過**的那幾句(STEP_MILESTONES 裡的),
       不可以現場拼一句 —— 卡片會被傳到 LINE 群組,錯的經文會一路傳下去。
     ⚠ 不畫任何個資:沒有名字、沒有地點、沒有經緯度(卡片是要拿去分享的)。
     用法:Pedometer.drawMonthCard(canvasEl, { state, title, now })  → 回傳 canvas */
  function drawMonthCard(canvas, o) {
    o = o || {};
    var state = o.state || { days: {} };
    var now = o.now || Date.now();
    var W = 900, H = 1010;
    canvas.width = W; canvas.height = H;
    var g = canvas.getContext("2d");
    var hm = heatmap(state, 182, now);
    var st = statsOf(state, now);

    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#123a2a"); bg.addColorStop(1, "#0a1f18");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    g.textAlign = "center";
    g.fillStyle = "#ffe9a8";
    g.font = "bold 62px system-ui, sans-serif";
    g.fillText(o.title || "🚶 走路足跡", W / 2, 110);
    g.fillStyle = "#cfe9dd";
    g.font = "34px system-ui, sans-serif";
    g.fillText(todayKey(now).slice(0, 7).replace("-", " 年 ") + " 月", W / 2, 168);

    // 三個大數字
    var nums = [
      { k: "今天", v: st.today },
      { k: "本月", v: rangeTotal(state, 1, now) },
      { k: "累計", v: st.total },
    ];
    for (var i = 0; i < nums.length; i++) {
      var cx = W / 6 + (W / 3) * i;
      g.fillStyle = "#8fe3b8";
      g.font = "bold 58px system-ui, sans-serif";
      g.fillText(String(nums[i].v), cx, 275);
      g.fillStyle = "#a9c9bd";
      g.font = "28px system-ui, sans-serif";
      g.fillText(nums[i].k, cx, 318);
    }
    g.fillStyle = "#ffd98a";
    g.font = "bold 36px system-ui, sans-serif";
    g.fillText("連續 " + st.streak + " 天出門走路", W / 2, 380);

    // 熱圖(近 26 週)
    // 熱圖水平居中(x0 由實際週數算,不寫死 —— 週數會隨 days 參數變)
    var CELL = 22, GAP = 5, y0 = 430;
    var x0 = Math.round((W - hm.weeks.length * (CELL + GAP) + GAP) / 2);
    var LEVELS = ["#1b3a2e", "#2f6b4a", "#48956a", "#6cc189", "#a7ecb6"];
    for (var w = 0; w < hm.weeks.length; w++) {
      for (var d = 0; d < 7; d++) {
        var cell = hm.weeks[w][d];
        if (!cell) continue;
        g.fillStyle = LEVELS[cell.level];
        g.fillRect(x0 + w * (CELL + GAP), y0 + d * (CELL + GAP), CELL, CELL);
      }
    }
    g.textAlign = "center";
    g.fillStyle = "#a9c9bd";
    g.font = "26px system-ui, sans-serif";
    g.fillText("近半年每天走的步數(顏色越亮=走得越多)", W / 2, y0 + 7 * (CELL + GAP) + 48);

    // 🏆 下一段金句還差幾步(比一個乾巴巴的總數有黏著力)
    var nx = nextMilestone(st.total);
    g.fillStyle = "#8fe3b8";
    g.font = "30px system-ui, sans-serif";
    g.fillText(nx
      ? "還差 " + nx.remain.toLocaleString() + " 步解鎖下一段金句"
      : "六段金句全部解鎖了", W / 2, y0 + 7 * (CELL + GAP) + 104);

    // 金句:用「已達成的最高台階」那一句(全部 cuv 查驗過)
    var reached = null;
    for (var m = 0; m < STEP_MILESTONES.length; m++) {
      if (st.total >= STEP_MILESTONES[m].n) reached = STEP_MILESTONES[m];
    }
    var line = reached ? reached.verse : "「他使我的靈魂甦醒,為自己的名引導我走義路。」——詩篇 23:3";
    g.fillStyle = "#ffe9a8";
    g.font = "32px system-ui, sans-serif";
    wrapText(g, line, W / 2, y0 + 7 * (CELL + GAP) + 190, W - 140, 50);

    g.fillStyle = "#7fa596";
    g.font = "24px system-ui, sans-serif";
    g.fillText("步數由手機動作感測估算,會比系統計步器少", W / 2, H - 56);
    return canvas;
  }

  /* 逐字斷行,但**把連續的非中文字元當成一個不可切的字塊**。
     ⚠ 純逐字版會把出處切開:「路加福音 24:1 / 5」—— 首版實測就是這樣斷的,
       而經文出處被切一半在分享卡上特別糟(卡片會被傳到群組)。 */
  function wrapText(g, text, cx, y, maxW, lh) {
    var toks = [], cur = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var ascii = ch.charCodeAt(0) < 0x2000 && ch !== " ";   // 數字/英文/半形標點
      if (ascii) { cur += ch; continue; }
      if (cur) { toks.push(cur); cur = ""; }
      toks.push(ch);
    }
    if (cur) toks.push(cur);
    var line = "", lines = [];
    for (var k = 0; k < toks.length; k++) {
      var t = line + toks[k];
      if (g.measureText(t).width > maxW && line) { lines.push(line); line = toks[k]; }
      else line = t;
    }
    if (line) lines.push(line);
    for (var j = 0; j < lines.length; j++) g.fillText(lines[j], cx, y + j * lh);
    return lines.length;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     📤 足跡匯出 / 匯入(0827 訂正)
     ══════════════════════════════════════════════════════════════════════════
     ⚠⚠ **這一段是在修一句我自己寫錯的話。** 原本的註解寫「步數存在 save 裡,
       自動跟著既有的羊圈匯出/匯入走」—— **是假的**:尋羊記的匯出走
       `SheepDex.exportDexText(loadDex())`,只匯出**羊圈圖鑑**,不匯出 save 物件
       ⇒ 步數其實換手機就不見,而匯出/匯入都會說「完成」。
       ★ 這就是 backup-chain-guard #42 抓的那型:匯出說成功、匯入說成功、零紅燈,
         只有換手機那天才發現東西沒了。★★ 而我是**寫在註解裡騙了自己**,不是漏做。
     ⇒ 正解不是改文件,是給步數自己一份可攜格式。**刻意不塞進羊圈格式**:
       那份是跨站共用的,而且它的隱私註解明確寫著「不寫地點、不寫經緯度,
       免得日後順手補上」—— 往裡面加欄位就是在鬆動那條。
     ★ 合併規則是**每天取大值,不是相加**:同一天在兩台裝置上都記了,相加會 double count;
       取大值最壞情況是少算,而本包的原則一直是**寧可少算不多算**。
     ★ 兩站不同 origin ⇒ 這份格式順便讓「尋羊記 ↔ 3D 站」的足跡可以互搬。 */
  var IO_TAG = "hfpc-steps-v1";

  function exportText(state) {
    var days = {};
    for (var k in state.days) {
      if (Object.prototype.hasOwnProperty.call(state.days, k)) days[k] = state.days[k];
    }
    return JSON.stringify({ t: IO_TAG, v: 1, days: days });
  }

  /* 回傳合併了幾天;**格式不對回 -1**(不是 0)——
     「匯入 0 天」與「檔案壞掉」是兩件事,都印「完成」就是無聲失敗
     (sheepdex 的 importDexText 刻意用 -1 區分,這裡照抄那個約定)。 */
  function importText(state, text) {
    var o = null;
    try { o = JSON.parse(String(text || "").trim()); } catch (e) { return -1; }
    if (!o || o.t !== IO_TAG || !o.days || typeof o.days !== "object") return -1;
    var merged = 0;
    for (var k in o.days) {
      if (!Object.prototype.hasOwnProperty.call(o.days, k)) continue;
      if (!DAY_RE.test(k)) continue;
      var v = Math.floor(Number(o.days[k]));
      if (!isFinite(v) || v <= 0) continue;
      var cur = state.days[k] || 0;
      if (v > cur) { state.days[k] = v; merged++; }     // 取大值,不相加
    }
    prune(state.days);
    return merged;
  }

  function create(opts) {
    opts = opts || {};
    var state = normalize(opts.load ? opts.load() : null);
    var win = typeof window !== "undefined" ? window : null;
    var running = false, handler = null;
    var base = null, prevMag = null, rising = false, lastStepAt = 0, warm = 0;
    var lastFix = null, gpsMeters = 0;

    function bump(n, now) {
      if (!(n > 0)) return;
      var k = todayKey(now);
      state.days[k] = (state.days[k] || 0) + n;
      prune(state.days);
      if (opts.save) opts.save(state);
      if (opts.onChange) opts.onChange(statsOf(state, now));
    }

    /* 一筆加速度樣本 → 有沒有踩到一步。
       magnitude 減掉低通基線(去掉重力與手持姿勢),看「由升轉降且幅度夠大」的那一刻。
       ⚠ 不用固定門檻:放口袋 / 拿手上 / 綁手臂,幅度差好幾倍 ⇒ 基線自適應。 */
    function feed(mag, now) {
      if (!isFinite(mag)) return 0;
      if (base === null) { base = mag; prevMag = mag; return 0; }
      base = base * 0.92 + mag * 0.08;
      var dyn = mag - base, counted = 0;
      if (warm < WARMUP_SAMPLES) { warm++; prevMag = mag; return 0; }
      if (dyn > STEP_THRESH && mag > prevMag) rising = true;
      if (rising && mag < prevMag) {
        rising = false;
        if (now - lastStepAt >= MIN_STEP_MS) { lastStepAt = now; counted = 1; }
      }
      if (now - lastStepAt > MAX_STEP_MS) lastStepAt = 0;
      prevMag = mag;
      return counted;
    }

    function onMotion(ev) {
      var a = ev.accelerationIncludingGravity || ev.acceleration;
      if (!a) return;
      var mag = Math.sqrt((a.x || 0) * (a.x || 0) + (a.y || 0) * (a.y || 0) + (a.z || 0) * (a.z || 0));
      /* 步頻用**事件自己的 timeStamp**,不用 Date.now():
         ① 事件時戳是感測器排隊時記的,比 handler 被呼叫時讀的牆鐘準
            (主執行緒忙的時候 handler 會延遲,牆鐘會把兩步擠成一步);
         ② 也讓桌機驗收有辦法驅動時間(scripts/verify-steps.mjs 靠這個在幾毫秒內
            重播 100 步的節奏 —— 不然合成訊號全被 MIN_STEP_MS 吃掉,只會數到 1 步)。
         ⚠ 每日桶仍用 Date.now()(那是「哪一天」,跟節奏是兩件事)。 */
      var t = (typeof ev.timeStamp === "number" && isFinite(ev.timeStamp) && ev.timeStamp > 0)
        ? ev.timeStamp : Date.now();
      if (feed(mag, t)) bump(1, Date.now());
    }

    /* 啟動。★ 一定要從使用者手勢裡呼叫(iOS 的授權只認手勢)。
       回傳 {ok, mode, reason};mode 是 motion 或 gps(退回估算)。
       ⚠ reason 一律講「發生了什麼」不是「失敗」——「被 LINE 擋住」與「使用者按拒絕」
         是兩件事,給的下一步也不同(換瀏覽器 vs 去系統設定)。 */
    function start() {
      var inApp = inAppBrowser(win && win.navigator && win.navigator.userAgent);
      if (!win || typeof win.DeviceMotionEvent === "undefined") {
        state.mode = "gps";
        return Promise.resolve({ ok: true, mode: "gps", reason: inApp ? "inapp-" + inApp : "no-sensor" });
      }
      var need = typeof win.DeviceMotionEvent.requestPermission === "function";
      var chain = need ? win.DeviceMotionEvent.requestPermission() : Promise.resolve("granted");
      return chain.then(function (res) {
        if (res !== "granted") { state.mode = "gps"; return { ok: true, mode: "gps", reason: "denied" }; }
        handler = onMotion;
        win.addEventListener("devicemotion", handler, { passive: true });
        running = true;
        state.mode = "motion";
        state.since = state.since || Date.now();
        if (opts.save) opts.save(state);
        return { ok: true, mode: "motion", reason: null };
      }).catch(function () {
        // 內建瀏覽器常常是「requestPermission 直接拋」而不是回 denied
        state.mode = "gps";
        return { ok: true, mode: "gps", reason: inApp ? "inapp-" + inApp : "error" };
      });
    }

    function stop() {
      if (handler && win) win.removeEventListener("devicemotion", handler);
      handler = null; running = false;
    }

    /* GPS 軌:站台本來就在收定位,把點餵進來。
       ⚠ motion 可用時**完全不計** —— 兩軌相加就是 double count。 */
    function addGpsFix(lat, lon, accuracy, ts) {
      if (state.mode === "motion") return 0;
      if (!isFinite(lat) || !isFinite(lon)) return 0;
      if (isFinite(accuracy) && accuracy > GPS_MAX_ACC) return 0;
      var fix = { lat: lat, lon: lon, t: isFinite(ts) ? ts : Date.now() };
      if (!lastFix) { lastFix = fix; return 0; }
      var d = haversine(lastFix, fix);
      lastFix = fix;
      if (!(d > 1)) return 0;                 // 1m 以內當定位漂移
      if (d > GPS_MAX_JUMP_M) return 0;        // ★ 跳點:不夾住會一次冒出幾千步
      gpsMeters += d;
      var steps = Math.floor(gpsMeters / STRIDE_M);
      if (steps > 0) { gpsMeters -= steps * STRIDE_M; bump(steps, Date.now()); }
      return steps;
    }

    return {
      start: start, stop: stop, addGpsFix: addGpsFix,
      stats: function () { return statsOf(state, Date.now()); },
      isRunning: function () { return running; },
      inAppBrowser: function () { return inAppBrowser(win && win.navigator && win.navigator.userAgent); },
      reset: function () {
        state = emptyState();
        if (opts.save) opts.save(state);
        if (opts.onChange) opts.onChange(statsOf(state, Date.now()));
      },
      _feed: feed,
      _state: function () { return state; },
    };
  }

  return {
    create: create,
    STRIDE_M: STRIDE_M, MIN_STEP_MS: MIN_STEP_MS, GPS_MAX_JUMP_M: GPS_MAX_JUMP_M,
    STEP_THRESH: STEP_THRESH, WARMUP_SAMPLES: WARMUP_SAMPLES,
    inAppBrowser: inAppBrowser, statsOf: statsOf, normalize: normalize,
    todayKey: todayKey, haversine: haversine,
    // 🏆 里程碑 + 🗓 熱圖 + 🖼 月報卡(0827)
    STEP_MILESTONES: STEP_MILESTONES, milestoneDue: milestoneDue, nextMilestone: nextMilestone,
    heatmap: heatmap, rangeTotal: rangeTotal, drawMonthCard: drawMonthCard,
    // 📤 足跡可攜(0827 訂正:步數本來不在任何匯出鏈裡)
    IO_TAG: IO_TAG, exportText: exportText, importText: importText,
  };
});
