/* 📏 上排寬度閘門 — 2026-08-27
 *
 * 由來:index.html 的 CSS 註解寫著「量過:五個元件約 356px < 可用 370px」——
 *   **但沒有留下量法**。0827 我加了兩個元件(步數膠囊+計步鈕)、沒有重新量,
 *   結果 360/390/412 三種寬度全部溢出,📖 羊圈 每一種都被推出畫面外
 *   —— 而羊圈是收藏冊與明信片匣的唯一入口,看不到等於那兩個功能不存在。
 *   ★ 那句「量過」寫在我正在編輯的同一個檔案裡,我還是犯了 ⇒ 知識要變成會跑的東西。
 *
 * ⚠ 一定要**強制顯示** 📍 精度膠囊與 🚶 步數膠囊再量:
 *   demo 模式沒有 GPS ⇒ 它們是隱藏的,不強制顯示就會量到比真手機小的數字
 *   (首次量測就是這樣漏的:測試沒進到真實狀態)。
 *
 * 跑法:先 `npx http-server -p 5199 -c-1 .`,再 node scripts/verify-topbar.mjs
 * ⚠ 用 process.exitCode,不用 process.exit()(守門 #36)
 */
const { chromium } = await (async () => {
  const { pathToFileURL } = await import("node:url"); const { homedir } = await import("node:os")
  return await import(pathToFileURL(homedir() + "/Downloads/hfpc-git/sheepflock3d/node_modules/playwright/index.mjs").href)
})()
let fail = 0
const b = await chromium.launch()
for (const w of [360, 390, 412]) {
  const p = await b.newPage({ viewport: { width: w, height: 800 } })
  await p.goto("http://127.0.0.1:5199/", { waitUntil: "load" }); await new Promise(r => setTimeout(r, 800))
  await p.locator("#agree").check(); await p.locator("#demoBtn").click(); await new Promise(r => setTimeout(r, 1200))
  // ⚠ 強制顯示 📍 精度膠囊與步數膠囊:demo 模式沒有 GPS 所以它們是隱藏的,
  //    上一次量測就是漏了 ⇒ 量到的溢出比真手機上小(測試沒進到真實狀態)。
  await p.evaluate(() => {
    document.querySelector("#accChip").style.display = "inline-block"
    document.querySelector("#stepChip").style.display = "inline-block"
    const pc = document.querySelector("#placeChip")
    pc.style.display = "inline-block"; pc.textContent = "🏞 敦化南路二段63巷 ›"
  })
  const measure = (sel) => p.evaluate((sel) => {
    const box = document.querySelector(sel)
    const kids = [...box.children].filter((e) => getComputedStyle(e).display !== "none")
    const cs = getComputedStyle(box)
    let sum = 0
    const items = kids.map((e) => {
      const wd = e.getBoundingClientRect().width
      if (!e.classList.contains("grow")) sum += wd
      return { t: (e.textContent || "").trim().slice(0, 9), w: Math.round(wd), right: Math.round(e.getBoundingClientRect().right) }
    })
    const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const gaps = (kids.length - 1) * parseFloat(cs.gap || 0)
    const off = items.filter((i) => i.right > window.innerWidth + 0.5)
    return { avail: Math.round(avail), need: Math.round(sum + gaps), items, offscreen: off.map((i) => i.t) }
  }, sel)
  const a = await measure(".top")
  const c = await measure("#row2")
  /* 🍞 toast 有沒有蓋住那兩排?0826 修過反向版本(提示條被 #placeChip 蓋住),
     0827 真機截圖又抓到正向版本(toast 蓋住第二排的地名與步數膠囊)。
     ⇒ 這條用**矩形相交**判定,不用眼睛看。 */
  const overlap = await p.evaluate(() => {
    const t = document.querySelector("#toast")
    t.style.display = "block"
    t.textContent = "這一帶是「信義路五段150巷」——等一下就在這裡救羊"
    const r = t.getBoundingClientRect()
    const hit = (sel) => {
      const b = document.querySelector(sel).getBoundingClientRect()
      return !(r.bottom <= b.top || r.top >= b.bottom)
    }
    const res = { top: hit(".top"), row2: hit("#row2"), toastTop: Math.round(r.top) }
    t.style.display = "none"
    return res
  })
  if (overlap.top || overlap.row2) {
    fail++
    console.log("  🔴 toast(top=" + overlap.toastTop + "px)蓋住 "
      + [overlap.top ? ".top" : "", overlap.row2 ? "#row2" : ""].filter(Boolean).join(" / "))
  } else {
    console.log("  🍞 toast(top=" + overlap.toastTop + "px)沒有蓋住上面兩排 🟢")
  }
  console.log(`\n=== ${w}px ===`)
  console.log(`  .top  可用 ${a.avail} / 需要 ${a.need}  ${a.need > a.avail ? "🔴 溢出 " + (a.need - a.avail) : "🟢"}   ` + a.items.map((i) => `${i.t}:${i.w}`).join("  "))
  if (a.offscreen.length) { fail++; console.log("    🔴 被推出畫面外:", a.offscreen.join(" / ")) }
  if (a.need > a.avail) fail++
  console.log(`  row2  可用 ${c.avail} / 需要 ${c.need}  ${c.need > c.avail ? "🔴 溢出 " + (c.need - c.avail) : "🟢"}   ` + c.items.map((i) => `${i.t}:${i.w}`).join("  "))
  if (c.offscreen.length) { fail++; console.log("    🔴 被推出畫面外:", c.offscreen.join(" / ")) }
  if (c.need > c.avail) fail++
  await p.close()
}
await b.close()
console.log("")
console.log(fail
  ? `🔴 上排寬度不合格(${fail} 項)——不要再往那一排塞東西,移到 #row2 或合併。`
  : "🟢 上排在 360/390/412px 都排得下,沒有元件被推出畫面外。")
process.exitCode = fail ? 1 : 0
