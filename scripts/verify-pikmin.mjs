/* 🏞 v14「向皮克敏學的四件 + 明信片」驗收閘門 — 2026-07-31
 *
 * 由來:使用者拿皮克敏 Bloom 的截圖問「我們為什麼不能有地點膠囊/實景背景/簡化地圖/指南針/明信片」。
 *   盤點後大半早就寫好、只是沒露出來,這支就是把「露出來了沒」變成可重跑的斷言。
 *
 * ★ 鐵則(本站 0731 立的守門 #29 evaluate-not-click-guard):
 *   會動的東西一律 **locator().click()**,不可以用 page.evaluate 直接呼叫函式 ——
 *   那樣「按鈕被 CSS 藏起來/被蓋住/disabled」通通照樣通過(v1 抓不到羊兩天就是這樣漏掉的)。
 *   evaluate 只拿來**讀畫面事實**。
 *
 * 跑法:先 `npx http-server -p 5199 -c-1 .`,再
 *   URL=http://127.0.0.1:5199/ node scripts/verify-pikmin.mjs
 */
import { chromium } from "playwright"

const URL_ = process.env.URL || "http://127.0.0.1:5199/"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const FAKE_PLACE = "測試河濱公園"

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`${ok ? "🟢" : "🔴"} ${name}${detail ? " — " + detail : ""}`)
}

/* 定位 stub:立刻回一筆好定位(這支不測定位,那是 verify-geo 的事) */
const GEO_STUB = `(() => {
  const P = { coords: { latitude: 25.033, longitude: 121.5654, accuracy: 9 }, timestamp: Date.now() };
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
    getCurrentPosition(ok) { setTimeout(() => ok(P), 60) },
    watchPosition(ok) { setTimeout(() => ok(P), 80); return 1 },
    clearWatch() {},
  }});
})()`

const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const errs = []
page.on("pageerror", (e) => errs.push("pageerror: " + e.message))

/* 地名反查改打假資料:真的連 Nominatim 會慢、會被限流,而且測試不該依賴外網 */
await page.route(/nominatim\.openstreetmap\.org/, (route) =>
  route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ name: FAKE_PLACE, category: "leisure", type: "park",
      address: { suburb: FAKE_PLACE } }) }))
/* 圖磚不要真的抓(離線也要能跑);回一張 1×1 透明 png */
await page.route(/tile\.openstreetmap\.org/, (route) =>
  route.fulfill({ status: 200, contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64") }))

await page.addInitScript(GEO_STUB)
await page.goto(URL_, { waitUntil: "domcontentloaded" })
await page.waitForSelector("#startBtn")

/* 同意守則 → 真的按「用 GPS 開始找羊」 */
await page.locator("#agree").check()
await page.locator("#startBtn").click()
await page.waitForSelector("#map.leaflet-container", { timeout: 15000 })
await sleep(2500)

/* ══ ① 地點膠囊 ══ */
{
  const s = await page.evaluate(() => {
    const el = document.getElementById("placeChip")
    return { shown: !!el && getComputedStyle(el).display !== "none", txt: el ? el.textContent : "" }
  })
  check("①a 地點膠囊常駐顯示,且寫的是當場反查來的地名",
    s.shown && s.txt.includes(FAKE_PLACE), `「${s.txt}」`)

  await page.locator("#placeChip").click()          // ← 真的按下去
  await sleep(300)
  const t = await page.evaluate(() => {
    const el = document.getElementById("toast")
    return getComputedStyle(el).display !== "none" ? el.textContent : ""
  })
  check("①b 點膠囊會說出它對應哪個 3D 戰鬥背景", /背景用/.test(t), t.slice(0, 40))
}

/* ══ ② 指南針 ══ */
{
  const before = await page.evaluate(() =>
    getComputedStyle(document.getElementById("compass")).display !== "none")
  check("②a 還沒收到方位事件時,指南針**不顯示**(不會出現一根不會動的死針)", !before)

  await page.evaluate(() => {
    const e = new Event("deviceorientation")
    Object.defineProperty(e, "alpha", { value: 90 })
    Object.defineProperty(e, "beta", { value: 0 })
    Object.defineProperty(e, "gamma", { value: 0 })
    dispatchEvent(e)
  })
  await sleep(250)
  const after = await page.evaluate(() => {
    const c = document.getElementById("compass")
    return { shown: getComputedStyle(c).display !== "none",
      tf: c.querySelector(".needle").style.transform }
  })
  check("②b 收到方位就顯示,且針轉到正確角度(alpha=90 → 360-90=270 → rotate(-270deg))",
    after.shown && after.tf === "rotate(-270deg)", after.tf || "(沒有 transform)")
}

/* ══ ③ 地圖底圖(v16:換成 CARTO Voyager,額外的 filter 改成預設關)══ */
{
  const s = await page.evaluate(() => {
    const m = document.getElementById("map")
    const img = m.querySelector("img.leaflet-tile")
    const probe = document.createElement("div")      // 圖磚可能還沒載進來,用同 class 的探針量規則有沒有生效
    probe.className = "leaflet-tile"; m.appendChild(probe)
    const f = getComputedStyle(probe).filter
    probe.remove()
    return {
      cls: m.classList.contains("pikmin"), filter: f,
      src: img ? img.src : "",
      attr: (document.querySelector(".leaflet-control-attribution") || {}).textContent || "",
      sw: !!document.getElementById("mapColorSw"),
    }
  })
  check("③a 底圖是 CARTO Voyager(不是 OSM 官方樣式)",
    /cartocdn\.com\/rastertiles\/voyager/.test(s.src), s.src.slice(0, 70) || "(圖磚還沒載到)")
  /* ★ CARTO 免費底圖的授權要求,漏了就是違反授權 —— 這一項不是裝飾 */
  check("③b 有標示 CARTO 授權", /CARTO/.test(s.attr) && /OpenStreetMap/.test(s.attr), s.attr.slice(0, 60))
  /* v16:額外那層鮮豔 filter 預設**關閉** —— 截圖比對後發現疊在 Voyager 上會更糊、路名更難讀,
     而這是走在路上看的地圖,可讀性優先。開關留著讓人自己比較。 */
  check("③c 額外的鮮豔濾鏡預設關閉(可讀性優先),但開關還在", !s.cls && s.sw,
    s.cls ? "🔴 濾鏡竟然是開的" : "預設關 🟢")
}

/* ══ ④ 挑戰詳情面板 ══ */
{
  await page.locator(".sheepMark").first().click()   // ← 真的點地圖上的羊
  await sleep(400)
  const s = await page.evaluate(() => {
    const sh = document.getElementById("sheet")
    return { shown: getComputedStyle(sh).display !== "none" && sh.classList.contains("on"),
      title: document.getElementById("shTitle").textContent,
      info: document.getElementById("shInfo").textContent,
      catchDisabled: document.getElementById("shCatch").disabled }
  })
  check("④a 點羊會彈出詳情面板,寫出羊名與距離",
    s.shown && s.title.trim().length > 1 && /公尺/.test(s.info), `${s.title} / ${s.info.slice(0, 34)}`)
  check("④b 太遠時「帶回這隻羊」是 disabled,而且講出還差幾公尺(不讓孩子按了沒反應)",
    !s.catchDisabled || /還要再走/.test(s.info), s.catchDisabled ? "disabled 🟢" : "在範圍內,鈕可按")

  await page.locator("#shClose").click()
  await sleep(400)
  const closed = await page.evaluate(() =>
    !document.getElementById("sheet").classList.contains("on"))
  check("④c 關得掉", closed)
}

/* ══ ⑤ 明信片:走完一次真的抓羊 ══ */
{
  // 客廳模式的「走一步」鈕只在 demo 模式出現 → 重新載入走客廳測試模式
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForSelector("#startBtn")
  await page.locator("#agree").check()
  await page.locator("#demoBtn").click()             // 🧪 客廳測試模式
  await sleep(1200)

  let arrived = false
  for (let i = 0; i < 40 && !arrived; i++) {
    await page.locator("#walkBtn").click()           // ← 一步一步真的按
    await sleep(160)
    arrived = await page.evaluate(() =>
      getComputedStyle(document.getElementById("nearBar")).display !== "none")
  }
  check("⑤a 客廳模式走得到羊旁邊(25m 內,「帶回這隻羊」鈕出現)", arrived)

  if (arrived) {
    await page.locator("#nearBar").click()
    await sleep(1200)
    /* 甩杖/套索打到結算。
       ⚠ 第一版是**每 110ms 盲按一次** —— 本機剛好過、線上就 FAIL:羊的種子含時段,
         不同時間遇到的獸與節奏都不一樣,盲按能不能命中綠區純靠運氣 = 閘門會間歇性假紅。
       ⇒ 改成**像人一樣瞄準**:讀畫面上指針與綠區的位置,進綠區才按套索;
         紅色預告線亮起就先閃避。仍然是真的 click(不可以改成 evaluate 呼叫函式)。 */
    let done = false
    for (let i = 0; i < 500 && !done; i++) {
      const st = await page.evaluate(() => {
        const z = document.getElementById("zone"), n = document.getElementById("needle")
        const zx = +z.dataset.x, zw = +z.dataset.w
        const m = /([\d.]+)%/.exec(n.style.left || "")
        const t = m ? +m[1] : -1
        return {
          tele: document.getElementById("meterBox").classList.contains("tele"),
          inZone: t >= 0 && t >= zx && t <= zx + zw,
          done: document.getElementById("pcPanel").classList.contains("on"),
        }
      })
      if (st.done) { done = true; break }
      if (st.tele) await page.locator("#dodgeBtn").click({ timeout: 2000 }).catch(() => {})
      else if (st.inZone) await page.locator("#ropeBtn").click({ timeout: 2000 }).catch(() => {})
      await sleep(45)
    }
    check("⑤b 帶回羊之後**明信片畫面自己跳出來**", done)

    if (done) {
      const px = await page.evaluate(() => {
        const cv = document.getElementById("pcCanvas")
        const g = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data
        const seen = new Set()
        let opaque = 0
        for (let i = 0; i < g.length; i += 4 * 997) {          // 疏取樣就夠判斷「是不是一片空白」
          if (g[i + 3] > 8) opaque++
          seen.add(`${g[i] >> 4},${g[i + 1] >> 4},${g[i + 2] >> 4}`)
        }
        return { colors: seen.size, opaque, w: cv.width, h: cv.height }
      })
      /* ★ 這一項就是在防 WebGL 那個坑:沒開 preserveDrawingBuffer 時,
           隔一個 tick 或 dispose 之後才 toDataURL 會得到**全透明的空白圖**,
           畫出來的明信片只剩底色 —— 顏色種類會少得可憐。 */
      check("⑤c 明信片不是空白圖(3D 快照真的截到了)",
        px.colors >= 8 && px.opaque > 100, `${px.w}×${px.h},取樣到 ${px.colors} 種顏色`)

      const btns = await page.evaluate(() => ["pcShare", "pcSave", "pcKeep"]
        .every((id) => { const e = document.getElementById(id); return e && getComputedStyle(e).display !== "none" }))
      check("⑤d 分享 / 下載 / 存進明信片匣 三個都在畫面上", btns)

      // 明信片匣預設關閉 → 打勾之後才存
      await page.locator("#pcKeep").check()          // ← 真的勾
      await sleep(200)
      const kept = await page.evaluate(() => {
        try { return !!(JSON.parse(localStorage.getItem("sheepquest-v1") || "{}").cardsKeep) } catch { return false }
      })
      check("⑤e 明信片匣預設關閉,勾了才寫進存檔(cardsKeep)", kept)

      await page.locator("#pcBack").click()
      await sleep(300)
      const back = await page.evaluate(() =>
        !document.getElementById("pcPanel").classList.contains("on"))
      check("⑤f 回得了地圖", back)
    }
  }
}

check("⑥ 全程無 pageerror", errs.length === 0, errs.slice(0, 3).join(" | "))

await browser.close()
const bad = results.filter((r) => !r.ok)
console.log(`\n${bad.length === 0 ? "🟢 PASS" : "🔴 FAIL"} — ${results.length - bad.length}/${results.length} 項通過`)
process.exit(bad.length === 0 ? 0 : 1)
