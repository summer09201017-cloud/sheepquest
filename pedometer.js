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
  };
});
