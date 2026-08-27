/* 🚶 計步健檢閘門 — 2026-08-27
 *
 * 由來:使用者「sheepflock3d 與尋羊記,要跟皮克敏一樣能計步」。
 *
 * ★ 這支的價值跟 verify-geo 同一個道理:計步唯一的真驗收是「拿手機走一千步再比對」,
 *   而那件事在桌機做不到 ⇒ 用 **stub 注入合成的 devicemotion 事件**在桌機重現,
 *   以後動 pedometer.js / 計步接線先跑這支,別再靠「拿手機出門走一趟」才知道壞了。
 *
 * 驗六件:
 *   ① pedometer.js 真的載進來了(window.Pedometer 不是 undefined ← UMD 掛全域那條)
 *   ② 按下「🚶 計步」後,合成的走路訊號會讓步數上升
 *   ③ 步數存進 **既有的 save 物件**(sheepquest-v1 裡的 steps),不新開 localStorage 鍵
 *      —— 這條是備份鏈:新鍵沒接進匯出,換手機就靜靜歸零(backup-chain-guard #42)
 *   ④ 重新載入後步數還在(不是只活在記憶體裡)
 *   ⑤ LINE 內建瀏覽器的 UA 會被認出來(那裡拿不到感測器,要講清楚而不是裝作成功)
 *   ⑥ 零 console error / pageerror
 *
 * 跑法:先 `npx http-server -p 5199 -c-1 .`,再
 *   URL=http://127.0.0.1:5199/ node scripts/verify-steps.mjs
 * ⚠ 用 process.exitCode,不用 process.exit()(守門 #36)
 */
/* ⚠ 這個 repo 是單檔 PWA,**沒有 node_modules** ⇒ 直接 `import "playwright"` 會 MODULE_NOT_FOUND。
   ⇒ 先試正常解析,失敗就去鄰居 repo 借(艦隊裡的 Vite 站都裝了)。
   不這樣做的話,這支只能靠「複製到別的 repo 再跑」,下一手多半就不跑了。 */
const { chromium } = await (async () => {
  try { return await import("playwright") } catch {}
  const { pathToFileURL } = await import("node:url")
  const { existsSync } = await import("node:fs")
  const { homedir } = await import("node:os")
  const cands = [
    process.env.PW_DIR,
    homedir() + "/Downloads/hfpc-git/sheepflock3d/node_modules/playwright/index.mjs",
    homedir() + "/Downloads/hfpc-git/billiards3d/node_modules/playwright/index.mjs",
  ].filter(Boolean)
  for (const c of cands) if (existsSync(c)) return await import(pathToFileURL(c).href)
  throw new Error("找不到 playwright。裝一份或設 PW_DIR=<…/playwright/index.mjs>")
})()

const URL_ = process.env.URL || "http://127.0.0.1:5199/"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0, fail = 0
const ok = (n, c, extra = "") => { if (c) { pass++; console.log(`  🟢 ${n}`) } else { fail++; console.log(`  🔴 ${n} ${extra}`) } }

const browser = await chromium.launch()

/* 情境 A:一般 Android/Chrome(沒有 requestPermission,直接就能收 devicemotion) */
{
  console.log("① 一般手機瀏覽器:載入 + 按鈕 + 合成走路訊號")
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 900 },
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
  })
  const page = await ctx.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e)))
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()) })

  await page.goto(URL_, { waitUntil: "load", timeout: 25000 })
  await sleep(900)
  /* 先過開場:勾「我答應遵守牧人守則」→ 進客廳測試模式(不用出門、也不用真定位)。
     ⚠ 不先過開場的話 #introPanel 會蓋住上排的按鈕,click 會一直重試到 timeout
       —— 那是**測試沒進到遊戲**,不是計步壞了。 */
  await page.locator("#agree").check()
  await page.locator("#demoBtn").click()
  await sleep(1200)

  ok("① pedometer.js 載進來了(window.Pedometer 不是 undefined)",
    await page.evaluate(() => typeof window.Pedometer === "object" && window.Pedometer !== null))

  ok("① 畫面上有「🚶 計步」鈕", await page.locator("#stepBtn").count() === 1)

  // 按真的按鈕(不是 evaluate 戳函式 —— evaluate-not-click-guard #29)
  await page.locator("#stepBtn").click()
  await sleep(300)

  ok("② 按下後步數膠囊出現", await page.locator("#stepChip").isVisible())

  /* 合成走路:每分鐘 110 步、峰值 3 m/s^2,50Hz 取樣,送 100 步份量。
     ⚠ 事件要在**頁面裡**用真的 DeviceMotionEvent 派發,才會走到 addEventListener 那條路。 */
  const counted = await page.evaluate(async () => {
    const hz = 50, cadence = 110, steps = 100, amp = 3
    const stepMs = 60000 / cadence
    const total = steps * stepMs
    for (let t = 0; t <= total; t += 1000 / hz) {
      const phase = (t % stepMs) / stepMs
      const bump = Math.pow(Math.max(0, Math.sin(phase * Math.PI)), 3)
      const mag = 9.8 + amp * bump
      // 把 magnitude 全放在 z 軸即可(pedometer 取的是向量長度)
      /* ⚠ timeStamp 要自己蓋掉:合成事件全在同一毫秒派發,不蓋的話步頻理智夾
         (MIN_STEP_MS)會把 100 步吃成 1 步 —— 首跑就是這樣紅的,而且那是**測試的問題**
         不是計步壞了。pedometer 讀 ev.timeStamp,所以這裡驅動它。 */
      const ev = new Event("devicemotion")
      Object.defineProperty(ev, "timeStamp", { value: t + 1, configurable: true })
      ev.accelerationIncludingGravity = { x: 0, y: 0, z: mag }
      window.dispatchEvent(ev)
    }
    return Number(document.getElementById("stepToday").textContent)
  })
  ok(`② 合成 100 步 → 畫面顯示 ${counted} 步(容許 80~120)`, counted >= 80 && counted <= 120, `got=${counted}`)

  const saved = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("sheepquest-v1") || "{}")
    const keys = Object.keys(localStorage)
    return { hasSteps: !!(raw.steps && raw.steps.days), keys, days: raw.steps ? Object.keys(raw.steps.days).length : 0 }
  })
  ok("③ 步數存進既有的 sheepquest-v1(不新開 localStorage 鍵)",
    saved.hasSteps && saved.keys.filter((k) => /step|pedo/i.test(k)).length === 0,
    JSON.stringify(saved.keys))
  ok("③ 每日桶有資料", saved.days >= 1, `days=${saved.days}`)

  // ④ 重新載入還在
  await page.reload({ waitUntil: "load" })
  await sleep(800)
  const after = await page.evaluate(() => Number(document.getElementById("stepToday").textContent || 0))
  ok(`④ 重新載入後步數還在(${after} 步)`, after >= 80, `after=${after}`)

  ok("⑥ 零 console error / pageerror", errors.length === 0, errors.slice(0, 3).join(" | "))
  await ctx.close()
}

/* 情境 B:從 LINE 點進來(內建瀏覽器)。★ 這裡拿不到感測器,而且使用者在設定裡調也沒用
   ⇒ 必須認出來並講清楚,不可以裝作成功。 */
{
  console.log("⑤ 從 LINE 點進來:要認得出內建瀏覽器")
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 900 },
    userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Line/13.5.0",
  })
  const page = await ctx.newPage()
  await page.goto(URL_, { waitUntil: "load", timeout: 25000 })
  await sleep(700)
  const detected = await page.evaluate(() => window.Pedometer.inAppBrowser(navigator.userAgent))
  ok("⑤ LINE 的 UA 被認出來", detected === "LINE", `got=${detected}`)
  await ctx.close()
}

await browser.close()
console.log(`\n🔬 verify-steps:${pass} 過 / ${fail} 失敗`)
console.log("⚠ 這支只證明接線與邏輯沒寫錯。真實準確度要拿手機走一次、跟系統計步器比對才知道。")
process.exitCode = fail ? 1 : 0
