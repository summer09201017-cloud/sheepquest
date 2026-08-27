/* 🎥🐕🐑 視角 / 狗 / 跟隨小隊 閘門 — 2026-08-27
 *
 * 由來:使用者 0827 真機回報四件
 *   ① 兩隻狗「只會逆時針旋轉」→ 要自由亂跑
 *   ② 身後 5 隻羊「太擠、黏在一起」→ 收成 3 隻、拉開間距
 *   ③ 近景「牧人太大,跟旁邊高樓一樣高」→ 量到 89.4m(25~30 層樓),確實太大
 *   ④ 要能多看到牧人的臉 → 新增「看正臉 / 過肩」兩檔(靠 bearing 繞到他前面)
 *   ⑤ 手機要能全螢幕
 *
 * ★ 這支的重點是把「看起來怪」變成**數字**:
 *   狗走的是不是圓、兩隻同不同步、牧人在世界裡幾公尺高、羊與羊差幾格。
 *   眼睛看得出來的東西,下一輪未必看得出來;數字會。
 *
 * 跑法:先 `npx http-server -p 5199 -c-1 .`,再 node scripts/verify-view-follow.mjs
 * ⚠ 用 process.exitCode,不用 process.exit()(守門 #36)
 */
const { chromium } = await (async () => {
  try { return await import("playwright") } catch {}
  const { pathToFileURL } = await import("node:url")
  const { existsSync } = await import("node:fs")
  const { homedir } = await import("node:os")
  const cands = [
    process.env.PW_DIR,
    homedir() + "/Downloads/hfpc-git/sheepflock3d/node_modules/playwright/index.mjs",
  ].filter(Boolean)
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
await sleep(3500)

console.log("① ⛶ 全螢幕(0827 使用者點名)")
/* ⚠ 首版這兩條踩了兩個坑,都寫在這裡:
   ① id 用了 `fsBtn` —— 那個 id 早就被 3D 戰鬥畫面的「⛶ 放大畫面」佔用 ⇒ 撞 id、
      兩個 onclick 互相蓋掉;count() 量到 2 才發現。
   ② 第二條原本寫成 `!top.contains(querySelector("#x"))` —— 元素**不存在**時
      contains(null) 是 false、取非就變 true ⇒ **假綠**。
      判準一定要先確認元素在,再問它在不在那一排。 */
const fsN = await page.locator("#mapFsBtn").count()
ok(`畫面上有 ⛶ 全螢幕鈕,而且只有一顆(${fsN})`, fsN === 1, String(fsN))
ok("⛶ 不在已經排滿的 .top 那一排(放右側控制列)", fsN === 1 &&
  await page.evaluate(() => {
    const el = document.querySelector("#mapFsBtn")
    return !!el && !document.querySelector(".top").contains(el)
  }))
ok("沒有跟 3D 戰鬥的 ⛶ 撞 id", await page.locator("#fsBtn").count() === 1,
  "fsBtn 應該只剩 3D 戰鬥那一顆")

console.log("② 🐑 跟隨小隊:3 隻、彼此拉開")
const flock = await page.evaluate(() => ({ max: window.__sqview.escortMax(), gap: window.__sqview.trailGap() }))
ok(`跟隨上限 3 隻(0827 從 5 收下來;${flock.max})`, flock.max === 3, String(flock.max))
ok(`羊與羊間隔 3 格 ≈ 18m(原本 2 格 ≈ 12m,近景下看起來是黏在一起的;${flock.gap})`, flock.gap >= 3, String(flock.gap))

console.log("③ 🧍 牧人的世界高度(0827 量到原本 89.4m ≈ 25~30 層樓)")
const scales = {}
for (const k of ["tilt", "close", "top"]) {
  await page.evaluate((k) => { window.__sqview && window.__sqview.set(k) }, k).catch(() => {})
  await sleep(500)
  scales[k] = await page.evaluate(() => window.__sqmap.chars().scale)
}
console.log("   世界比例:", JSON.stringify(scales))
ok(`近景的世界比例明顯小於斜視角(${scales.close} < ${scales.tilt})`,
  scales.close !== undefined && scales.tilt !== undefined && scales.close < scales.tilt * 0.75,
  JSON.stringify(scales))
const nativeH = 2.979   // 0827 量到的模型原生高
ok(`近景時牧人約 ${Math.round(scales.close * nativeH)}m(原本 89m;要 < 55m 才不會比整條街的樓都高)`,
  scales.close * nativeH < 55, `${(scales.close * nativeH).toFixed(1)}m`)

console.log("④ 🎥 視角:要有看得到臉的檔位")
const views = await page.evaluate(() => (window.__sqview ? window.__sqview.list() : []).map((v) => ({ k: v.k, n: v.n, face: !!v.faceCam })))
ok(`視角有 5 檔(原本 3 檔):${views.map((v) => v.n).join("/")}`, views.length >= 5, JSON.stringify(views))
ok("其中有 2 檔會把鏡頭繞到牧人前/後方(faceCam)", views.filter((v) => v.face).length === 2, JSON.stringify(views))

console.log("⑤ 🐕 狗:自由亂跑,不是等速圓周、兩隻不同步")
// 讓玩家走一段(demo 模式的方向鍵),邊走邊取樣狗的位置
const samples = []
for (let i = 0; i < 26; i++) {
  await page.locator("#walkBtn").click({ timeout: 2000 }).catch(() => {})
  await sleep(140)
  samples.push(await page.evaluate(() => window.__sqmap.dogs().pos))
}
const valid = samples.filter((s) => s && s.length === 2)
ok(`取到 ${valid.length} 筆兩隻狗的位置`, valid.length >= 10, String(valid.length))
if (valid.length >= 10) {
  // ⓐ 半徑會變 = 不是圓周運動(等速圓周的半徑是常數)
  const radii = valid.map((s) => s.map((p) => Math.hypot(p[0], p[1])))
  const r0 = radii.map((r) => r[0])
  const spread = Math.max(...r0) - Math.min(...r0)
  ok(`離牧人的距離會變(圓周運動不會):變化 ${spread.toFixed(1)}`, spread > 1.5, spread.toFixed(2))
  // ⓑ 兩隻的相位差不再固定是 π
  const angDiff = valid.map((s) => {
    const a0 = Math.atan2(s[0][0], s[0][1]), a1 = Math.atan2(s[1][0], s[1][1])
    let d = Math.abs(a0 - a1) % (Math.PI * 2)
    if (d > Math.PI) d = Math.PI * 2 - d
    return d
  })
  const dv = Math.max(...angDiff) - Math.min(...angDiff)
  ok(`兩隻不是固定相位差 π(變化 ${dv.toFixed(2)} rad)`, dv > 0.3, dv.toFixed(3))
  // ⓒ 不是固定同一個轉向(逆時針)
  let cw = 0, ccw = 0
  for (let i = 1; i < valid.length; i++) {
    const a = Math.atan2(valid[i][0][0], valid[i][0][1])
    const b = Math.atan2(valid[i - 1][0][0], valid[i - 1][0][1])
    let d = a - b
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    if (d > 0.01) cw++; else if (d < -0.01) ccw++
  }
  ok(`轉向不是一面倒(順 ${cw} / 逆 ${ccw})`, Math.min(cw, ccw) > 0 || cw + ccw < 3, `cw=${cw} ccw=${ccw}`)
}

ok("⑥ 零 pageerror / console error", errors.length === 0, errors.slice(0, 3).join(" | "))

await browser.close()
console.log("")
console.log(`🔬 verify-view-follow:${pass} 過 / ${fail} 失敗`)
process.exitCode = fail ? 1 : 0
