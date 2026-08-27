/* 🌱📷 走路讓羊長大 / 地標照片 閘門 — 2026-08-27
 *
 * 由來:使用者拿皮克敏在東莒的截圖當參考,拍板「兩個都做」(長大 + 長配飾)、
 *   並要「①地標照片 ②探險」。這一支守前兩件。
 *
 * ★ 最重要的一條是 ②:**餵的是「這次多走的步數」,不是「累計總步數」**。
 *   寫成總數的話,每次 onChange 都把累計再餵一遍 ⇒ 羊在幾秒內直接長滿,
 *   而且**不會有任何錯誤訊息**。這種錯只有量才抓得到。
 *
 * ⚠ 照片一律**只存本機**:這一支也驗「沒有把照片塞進羊圈匯出/短碼」——
 *   那會直接違反開場的隱私承諾(位置不上傳、羊圈不寫經緯度)。
 *
 * 跑法:先 `npx http-server -p 5199 -c-1 .`,再 node scripts/verify-grow-shot.mjs
 * ⚠ 用 process.exitCode,不用 process.exit()(守門 #36)
 */
const { chromium } = await (async () => {
  try { return await import("playwright") } catch {}
  const { pathToFileURL } = await import("node:url")
  const { existsSync } = await import("node:fs")
  const { homedir } = await import("node:os")
  const cands = [process.env.PW_DIR, homedir() + "/Downloads/hfpc-git/sheepflock3d/node_modules/playwright/index.mjs"].filter(Boolean)
  for (const c of cands) if (existsSync(c)) return await import(pathToFileURL(c).href)
  throw new Error("找不到 playwright,設 PW_DIR=<…/playwright/index.mjs>")
})()

const URL_ = process.env.URL || "http://127.0.0.1:5199/"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pass = 0, fail = 0
const ok = (n, c, extra = "") => { if (c) { pass++; console.log(`  🟢 ${n}`) } else { fail++; console.log(`  🔴 ${n} ${extra}`) } }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
const errors = []
page.on("pageerror", (e) => errors.push("pageerror: " + String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()) })

await page.goto(URL_, { waitUntil: "load", timeout: 25000 })
await sleep(900)
await page.locator("#agree").check()
await page.locator("#demoBtn").click()
await sleep(2500)

// 先塞三隻羊進羊圈,才有東西可以長
await page.evaluate(() => {
  const g = window.__sqgrow
  g.seedFlock(["s_a", "s_b", "s_c"])
})
await sleep(400)

console.log("① 🌱 成長:餵的是「差額」不是「累計總數」")
{
  const r = await page.evaluate(async () => {
    const g = window.__sqgrow
    g.reset()
    const st = window.__sqstep.ped()._state()
    const K = window.Pedometer.todayKey(Date.now())
    const snap = []
    // 模擬計步器連續回報「累計步數」:900 → 1200 → 1500
    for (const total of [900, 1200, 1500]) {
      st.days[K] = total
      window.__sqstep.ped().stats()
      g.pump()                       // 走一次 onChange 的路徑
      snap.push(Math.round(g.total()))
    }
    return { snap, per: g.each() }
  })
  /* 累計走了 1500 步、隊伍 3 隻 ⇒ 全隊總成長應該 ≈ 1500(平分),
     而不是 900+1200+1500=3600(那就是把總數當差額餵)。 */
  ok(`全隊總成長 ≈ 1500(拿到 ${r.snap[2]})——不是 3600`, r.snap[2] > 1200 && r.snap[2] < 1800, JSON.stringify(r.snap))
  ok(`3 隻平分,每隻約 500(${r.per.map((v) => Math.round(v)).join("/")})`,
    r.per.every((v) => v > 350 && v < 650), JSON.stringify(r.per))
}

console.log("② 🌱 只長不縮、只加不減(羊是使用者記得的東西)")
{
  const r = await page.evaluate(() => {
    const g = window.__sqgrow
    const s0 = g.scaleOf("s_a")
    g.set("s_a", 0)
    const s1 = g.scaleOf("s_a")
    g.set("s_a", 20000)
    const s2 = g.scaleOf("s_a")
    g.set("s_a", 999999)
    const s3 = g.scaleOf("s_a")
    return { s0: +s0.toFixed(3), s1: +s1.toFixed(3), s2: +s2.toFixed(3), s3: +s3.toFixed(3) }
  })
  ok(`0 步時倍率 = 1.000(起點就是牠原本的樣子,不會突然變小)`, r.s1 === 1, JSON.stringify(r))
  ok(`長滿是 ${r.s2}(大 38%)`, r.s2 > 1.3 && r.s2 < 1.45, JSON.stringify(r))
  ok(`超過上限不會無限長大(${r.s3} = ${r.s2})`, r.s3 === r.s2, JSON.stringify(r))
}

console.log("③ 🌼🔔🧣 配飾台階:走到才有,而且只加不減")
{
  const r = await page.evaluate(() => {
    const g = window.__sqgrow
    const at = (v) => { g.set("s_a", v); return g.decosOf("s_a").map((d) => d.k) }
    return { a0: at(0), a3: at(3000), a8: at(8000), a15: at(15000), back: at(15000) }
  })
  ok("0 步沒有配飾", r.a0.length === 0, JSON.stringify(r.a0))
  ok("3000 步 → 花環", r.a3.join() === "wreath", JSON.stringify(r.a3))
  ok("8000 步 → 花環+鈴鐺", r.a8.join() === "wreath,bell", JSON.stringify(r.a8))
  ok("15000 步 → 三樣都有", r.a15.join() === "wreath,bell,scarf", JSON.stringify(r.a15))
}

console.log("④ 📷 地標照片:存得住、會被縮小、而且只存本機")
{
  const r = await page.evaluate(async () => {
    const g = window.__sqgrow
    // 造一張 2000x1500 的假照片,驗它會被縮到 640 寬
    const big = document.createElement("canvas")
    big.width = 2000; big.height = 1500
    const c = big.getContext("2d")
    c.fillStyle = "#3a7"; c.fillRect(0, 0, 2000, 1500)
    c.fillStyle = "#fff"; c.fillRect(200, 200, 900, 700)
    const blob = await new Promise((res) => big.toBlob(res, "image/jpeg", 0.9))
    const file = new File([blob], "t.jpg", { type: "image/jpeg" })
    const url = await g.shrink(file)
    const im = new Image()
    await new Promise((res) => { im.onload = res; im.onerror = res; im.src = url })
    g.shotSave("tamkang", url)
    return {
      w: im.width, h: im.height,
      bytes: url.length,
      stored: !!g.shotGet("tamkang"),
      keys: Object.keys(localStorage),
    }
  })
  ok(`照片被縮到 640 寬(拿到 ${r.w}x${r.h})`, r.w === 640, `${r.w}x${r.h}`)
  ok(`縮圖大小 ${Math.round(r.bytes / 1024)}KB(原圖幾 MB;localStorage 只有 ~5MB)`, r.bytes < 300 * 1024, String(r.bytes))
  ok("存得回來", r.stored)
  ok("照片存在**自己的鍵**裡,不混進遊戲存檔", r.keys.includes("sheepquest-shots-v1"), JSON.stringify(r.keys))
}

console.log("⑤ 🔒 隱私:照片絕不可以進羊圈匯出/短碼")
{
  const r = await page.evaluate(() => {
    const dex = window.SheepDex.loadDex()
    const text = window.SheepDex.exportDexText(dex)
    return { hasImg: /data:image/.test(text), len: text.length }
  })
  ok("羊圈匯出的文字裡沒有任何圖片資料", !r.hasImg, `len=${r.len}`)
}

console.log("⑥ 📷 拍了新照片要讓 3D 忘掉「這個場景沒照片」的記憶")
ok("B3D.forgetPhoto 存在(不然換了照片下一場還是積木背景)",
  await page.evaluate(() => typeof window.__sq3d?.forgetPhoto === "function" || typeof window.B3D?.forgetPhoto === "function"))

console.log("⑦ 🧭 探險:步數當燃料,而且**完全不碰獅子與熊的戰鬥**")
{
  const r = await page.evaluate(() => {
    const g = window.__sqgrow
    g.reset()
    const st = window.__sqstep.ped()._state()
    const K = window.Pedometer.todayKey(Date.now())
    st.days[K] = 0; window.__sqstep.ped().stats()
    const started = g.tripStart("tamkang")
    const t0 = g.tripState()
    // 走一半 → 不可以回來
    st.days[K] = Math.floor(g.TRIP_COST / 2); window.__sqstep.ped().stats(); g.tripCheck()
    const halfway = { going: !!g.tripState().going, cards: g.tripState().cards.length, walked: Math.round(g.tripWalked()) }
    // 走滿 → 回來發卡
    st.days[K] = g.TRIP_COST + 10; window.__sqstep.ped().stats(); g.tripCheck()
    const done = { going: !!g.tripState().going, cards: g.tripState().cards.length, card: g.tripState().cards[0] }
    return { started, ids: (t0.going || {}).ids || [], halfway, done, verses: g.tripVerses().length }
  })
  ok("派得出去(有羊跟著時)", r.started === true, String(r.started))
  ok(`走一半不會回來(${r.halfway.walked}/${2000} 步,卡片 ${r.halfway.cards} 張)`,
    r.halfway.going === true && r.halfway.cards === 0, JSON.stringify(r.halfway))
  ok("走滿才回來並發一張探險卡", r.done.going === false && r.done.cards === 1, JSON.stringify(r.done))
  ok(`卡片有地標名與經文(${r.done.card && r.done.card.place} / ${r.done.card && r.done.card.ref})`,
    !!(r.done.card && r.done.card.place && r.done.card.verse && r.done.card.ref))
  /* ★ 這一條是使用者 0827 明講的:「原本跟獅子與熊戰鬥的版本也要保留」。
     探險必須是**額外**的東西,不可以動到戰鬥的任何入口或數值。 */
  const battle = await page.evaluate(() => ({
    b3d: typeof window.__sq3d === "object" && window.__sq3d !== null,
    beasts: !!document.querySelector("#b3d"),
    strike: typeof window.__sqmile === "object",
  }))
  ok("🦁🐻 獅子與熊的戰鬥完全沒被動到(3D 舞台與把手都在)",
    battle.b3d && battle.beasts, JSON.stringify(battle))
}

ok("⑧ 零 pageerror / console error", errors.length === 0, errors.slice(0, 3).join(" | "))

await browser.close()
console.log("")
console.log(`🔬 verify-grow-shot:${pass} 過 / ${fail} 失敗`)
process.exitCode = fail ? 1 : 0
