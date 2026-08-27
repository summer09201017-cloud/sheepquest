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

  /* 🚶 0827 訂正:原本是「膠囊 + 計步鈕」兩個元件,把 .top 那排擠爆(羊圈被推出畫面)。
     現在合併成**一顆 #stepChip**,而且移到第二排 #row2:
       還沒開始 → 顯示「🚶 計步」,按了才要授權;已在計步 → 顯示「🚶 N 步」,按了開足跡。 */
  ok("① 畫面上有 🚶 計步膠囊(在第二排,不在已經擠滿的 .top)",
    await page.locator("#row2 #stepChip").count() === 1)
  ok("① 未開始時顯示「計步」不是步數", /計步/.test(await page.locator("#stepChip").textContent()))

  // 按真的按鈕(不是 evaluate 戳函式 —— evaluate-not-click-guard #29)
  await page.locator("#stepChip").click()
  await sleep(300)

  ok("② 按下後膠囊還在(改顯示步數)", await page.locator("#stepChip").isVisible())

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
    return Number((document.getElementById("stepChip").textContent.match(/[0-9]+/) || [0])[0])
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
  const after = await page.evaluate(() => Number((document.getElementById("stepChip").textContent.match(/[0-9]+/) || [0])[0]))
  /* ★ 重新載入後計步一定是停的(iOS 授權只認手勢,不能自動啟動)——
     但**步數不可以因此看不見**:走了幾百步回來只看到「計步」兩個字,會以為資料掉了。
     ⇒ 驗「數字還在」+「有 ⏸ 誠實標示現在沒在計」。 */
  const chipText = await page.evaluate(() => document.getElementById("stepChip").textContent)
  ok(`④ 重新載入後步數還看得見(${after} 步)`, after >= 80, `after=${after} text=${chipText}`)
  ok(`④ 且標示了目前沒在計(⏸)`, /⏸/.test(chipText), chipText)

  console.log("⑦ 步數里程碑:走到台階要出慶祝畫面(彩帶+金句+蓋章)")
  /* ★ 驗**畫面上真的出現那段金句** —— 只讀資料證明不了它畫得出來(同 __sqmile 的註解)。 */
  const mile = await page.evaluate(() => {
    const st = window.__sqstep
    st.ped()._state().days[window.Pedometer.todayKey(Date.now())] = 1200   // 跨過 1000 台階
    const due = st.due(1200)
    return due ? { n: due.n, ref: due.ref } : null
  })
  ok(`1200 步該給 1000 台階(${mile && mile.ref})`, mile && mile.n === 1000, JSON.stringify(mile))

  const shown = await page.evaluate(() => {
    const m = window.Pedometer.STEP_MILESTONES[0]
    window.__sqmile.show({ ...m, title: `🏆 ${m.n} 步了!` }, {})
    return {
      on: document.querySelector("#milePanel").classList.contains("on"),
      title: document.querySelector("#mileTitle").textContent,
      verse: document.querySelector("#mileVerse").textContent,
    }
  })
  ok("慶祝畫面打開了", shown.on)
  ok(`標題用步數不是「隻」(${shown.title})`, /步了/.test(shown.title) && !/隻/.test(shown.title), shown.title)
  ok("畫面上有那段金句(cuv 查驗過的)", shown.verse.includes("引導我走義路"), shown.verse.slice(0, 40))

  console.log("⑧ 足跡面板:熱圖畫得出來 + 統計 + 月報卡")
  await page.evaluate(() => document.querySelector("#mileBack").click())
  await sleep(200)
  await page.evaluate(() => window.__sqstep.openPanel())
  await sleep(300)
  ok("足跡面板打開", await page.locator("#stepPanel").evaluate((el) => el.classList.contains("on")))
  const heat = await page.evaluate(() => {
    const cv = document.querySelector("#stepHeat")
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data
    let painted = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++
    return { w: cv.width, h: cv.height, painted, stats: document.querySelector("#stepStats").textContent }
  })
  // 「畫得出來」要用像素證明,不是看 canvas 存不存在
  ok(`熱圖有畫上像素(${heat.painted} 個不透明點)`, heat.painted > 100, JSON.stringify({ w: heat.w, h: heat.h, p: heat.painted }))
  ok("統計有本月/近3月/近12月/連續", /本月/.test(heat.stats) && /近 3 月/.test(heat.stats) && /連續/.test(heat.stats), heat.stats.slice(0, 60))
  ok("有講「還差 N 步解鎖下一段金句」", /還差/.test(heat.stats) || /全部解鎖/.test(heat.stats), heat.stats.slice(0, 80))

  await page.locator("#stepCardBtn").click()
  await sleep(600)
  const card = await page.evaluate(() => {
    const cv = document.querySelector("#stepCardCv")
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data
    let painted = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++
    return { w: cv.width, h: cv.height, painted, visible: document.querySelector("#stepCardWrap").style.display }
  })
  // ⚠ 高度不寫死:排版調過一次(1400→1010),寫死的話下次調版面這條會假紅
  ok(`月報卡畫出來了(${card.w}x${card.h})`, card.w === 900 && card.h > 800 && card.painted > 10000, JSON.stringify(card))
  ok("月報卡區塊顯示出來", card.visible === "block", card.visible)

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
