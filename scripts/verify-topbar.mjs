/* 📏 上排寬度閘門 — 2026-08-27 立;2026-11-13 曾改成量兩排;2026-11-14 退回量一排
 *
 * 由來:index.html 的 CSS 註解寫著「量過:五個元件約 356px < 可用 370px」——
 *   **但沒有留下量法**。0827 我加了兩個元件(步數膠囊+計步鈕)、沒有重新量,
 *   結果 360/390/412 三種寬度全部溢出,📖 羊圈 每一種都被推出畫面外
 *   —— 而羊圈是收藏冊與明信片匣的唯一入口,看不到等於那兩個功能不存在。
 *   ★ 那句「量過」寫在我正在編輯的同一個檔案裡,我還是犯了 ⇒ 知識要變成會跑的東西。
 *
 * 1114 退回:11/13 把頂列改成兩排(字 14px、鈕 48px),使用者用手機看畫面被按鈕撐滿,
 *   2026-11-14 指示退回改前、以後不要主動放大按鈕或改排法。這支閘門量的是改前那一套:
 *   ① 第一排(羊數 + 📍 精度 + 朗讀/音樂/羊圈)排得下、沒有元件被推出畫面外,而且**只有一排**
 *   ② 第二排(🚶 計步 + 🏞 地名)排得下
 *   ③ toast 不蓋住上面兩排
 *   ④ 「不可以比改前多一排」:頂部兩排的底不可以超過 90px(改前量到 87px;11/13 兩排版是 104px)
 *      —— 再有人想把頂列加高或拆成更多排,這條會紅,要先問使用者。
 *   ⑤ 頁面沒有橫向捲動
 *
 * ⚠ 一定要**強制顯示** 📍 精度膠囊與 🚶 步數膠囊再量:
 *   demo 模式沒有 GPS ⇒ 它們是隱藏的,不強制顯示就會量到比真手機小的數字
 *   (首次量測就是這樣漏的:測試沒進到真實狀態)。
 *
 * 跑法:node scripts/verify-topbar.mjs(自己起一個本機靜態伺服器,不用另外開 http-server)
 * ⚠ 用 process.exitCode,不用 process.exit()(守門 #36)
 */
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, extname, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { homedir } from "node:os"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
// playwright 不裝在這個 repo(刻意零 node_modules,wrangler --assets . 整目錄上傳)⇒ 借別的 repo 的
const PW = [
  join(homedir(), "Downloads/hfpc-git/sheepflock3d/node_modules/playwright/index.mjs"),
  join(homedir(), "Desktop/AI/hfpc-speak/node_modules/playwright/index.mjs"),
].find((p) => existsSync(p))
if (!PW) { console.log("🔴 找不到 playwright(sheepflock3d 或 hfpc-speak 的 node_modules)"); process.exitCode = 1 }
else {
const { chromium } = await import(pathToFileURL(PW).href)

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".json": "application/json", ".mp3": "audio/mpeg", ".png": "image/png", ".jpg": "image/jpeg" }
const srv = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname)
    if (p.endsWith("/")) p += "index.html"
    const f = join(root, p)
    if (!f.startsWith(root)) { res.writeHead(403); res.end(); return }
    const buf = await readFile(f)
    res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream", "cache-control": "no-store" }); res.end(buf)
  } catch { res.writeHead(404); res.end() }
})
await new Promise((r) => srv.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${srv.address().port}/`

const HEADER_MAX = 90   // 改前 360/390/412 量到頂部兩排的底 = 87px
let fail = 0
const bad = (msg) => { fail++; console.log("    🔴 " + msg) }
const b = await chromium.launch()
try {
  for (const [w, h] of [[360, 740], [390, 844], [412, 915]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } })
    await p.goto(base, { waitUntil: "load" }); await new Promise((r) => setTimeout(r, 800))
    await p.locator("#agree").check(); await p.locator("#demoBtn").click(); await new Promise((r) => setTimeout(r, 1500))
    // ⚠ 強制顯示 📍 精度膠囊與步數膠囊:demo 模式沒有 GPS 所以它們是隱藏的,
    //    上一次量測就是漏了 ⇒ 量到的溢出比真手機上小(測試沒進到真實狀態)。
    await p.evaluate(() => {
      document.querySelector("#accChip").style.display = "inline-block"; document.querySelector("#accVal").textContent = "128"
      document.querySelector("#stepChip").style.display = "inline-block"
      const pc = document.querySelector("#placeChip")
      pc.style.display = "inline-block"; pc.textContent = "🏞 敦化南路二段63巷 ›"
      /* ⚠ 已知邊角(改前 4e2c1b1 就是這樣,1114 量過一模一樣,沒修):羊數到 100/100 **而且**定位誤差 3 位數(±100m 以上)
         同時出現時,360/390 寬第一排會多 5~7px,「📖 羊圈」右緣被切掉一點。要修得動排法或縮字,使用者 1114 說
         「不要主動改排法」⇒ 留著等他決定。這裡量的是「還沒找齊(2 位數)+ GPS 很差(3 位數)」這個常見的最壞情況。 */
      document.querySelector("#count").textContent = "99"
      document.querySelector("#toast").style.display = "none"
    })
    const measure = (sel) => p.evaluate((sel) => {
      const box = document.querySelector(sel)
      const kids = [...box.children].filter((e) => getComputedStyle(e).display !== "none")
      const cs = getComputedStyle(box)
      let sum = 0
      const items = kids.map((e) => {
        const q = e.getBoundingClientRect()
        if (!e.classList.contains("grow")) sum += q.width
        return { t: (e.textContent || "").trim().slice(0, 9), id: e.id, w: Math.round(q.width), top: q.top, bottom: q.bottom, right: Math.round(q.right), grow: e.classList.contains("grow") }
      })
      const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const gaps = (kids.length - 1) * parseFloat(cs.gap || 0)
      const real = items.filter((i) => !i.grow)
      const off = real.filter((i) => i.right > window.innerWidth + 0.5)
      // 一排 = 每顆的垂直中線都落在同一條(膠囊與按鈕高度不同,用中線比)
      const mids = real.map((i) => (i.top + i.bottom) / 2)
      const oneRow = mids.length ? Math.max(...mids) - Math.min(...mids) < 8 : true
      return { avail: Math.round(avail), need: Math.round(sum + gaps), items: real, offscreen: off.map((i) => i.t), oneRow,
        bottom: Math.round(Math.max(0, ...real.map((i) => i.bottom))), ids: real.map((i) => i.id) }
    }, sel)
    const a = await measure(".top")
    const c = await measure("#row2")
    console.log(`\n=== ${w}×${h} ===`)
    console.log(`  .top  可用 ${a.avail} / 需要 ${a.need}  ${a.need > a.avail ? "🔴 溢出 " + (a.need - a.avail) : "🟢"}   ` + a.items.map((i) => `${i.t}:${i.w}`).join("  "))
    if (a.offscreen.length) bad("被推出畫面外:" + a.offscreen.join(" / "))
    if (a.need > a.avail) fail++
    if (!a.oneRow) bad("第一排折成兩排了")
    if (!a.ids.includes("accChip")) bad("📍 精度膠囊不在第一排(改前它在第一排)")
    console.log(`  row2  可用 ${c.avail} / 需要 ${c.need}  ${c.need > c.avail ? "🔴 溢出 " + (c.need - c.avail) : "🟢"}   ` + c.items.map((i) => `${i.t}:${i.w}`).join("  "))
    if (c.offscreen.length) bad("被推出畫面外:" + c.offscreen.join(" / "))
    if (c.need > c.avail) fail++
    if (!c.oneRow) bad("第二排折成兩排了")
    const headerBottom = Math.max(a.bottom, c.bottom)
    if (headerBottom > HEADER_MAX) bad(`頂部兩排的底在 ${headerBottom}px > ${HEADER_MAX}px(比改前多出一排或加高了;改前 87px)`)
    else console.log(`  📏 頂部兩排的底 ${headerBottom}px ≤ ${HEADER_MAX}px 🟢`)
    /* 🍞 toast 有沒有蓋住那兩排?0826 修過反向版本(提示條被 #placeChip 蓋住),
       0827 真機截圖又抓到正向版本(toast 蓋住第二排的地名與步數膠囊)。
       ⇒ 這條用**矩形相交**判定,不用眼睛看。 */
    const overlap = await p.evaluate(() => {
      const t = document.querySelector("#toast")
      t.style.display = "block"
      t.textContent = "這一帶是「信義路五段150巷」——等一下就在這裡救羊"
      const r = t.getBoundingClientRect()
      const hit = (sel) => [...document.querySelectorAll(sel + " > *")].filter((e) => getComputedStyle(e).display !== "none")
        .some((e) => { const q = e.getBoundingClientRect(); return q.width > 0 && !(r.bottom <= q.top || r.top >= q.bottom) })
      const res = { top: hit(".top"), row2: hit("#row2"), toastTop: Math.round(r.top) }
      t.style.display = "none"
      return res
    })
    if (overlap.top || overlap.row2) bad(`toast(top=${overlap.toastTop}px)蓋住 ` + [overlap.top ? ".top" : "", overlap.row2 ? "#row2" : ""].filter(Boolean).join(" / "))
    else console.log(`  🍞 toast(top=${overlap.toastTop}px)沒有蓋住上面兩排 🟢`)
    const hs = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    if (hs) bad("頁面可以橫向捲動")
    await p.close()
  }
} finally { await b.close(); srv.close() }
console.log("")
console.log(fail
  ? `🔴 上排不合格(${fail} 項)——不要再往那一排塞東西,也不要把頂列加高或拆成更多排(要先問使用者)。`
  : "🟢 上排在 360/390/412px 都排得下、只有一排,沒有元件被推出畫面外;頂部沒有比改前高。")
process.exitCode = fail ? 1 : 0
}
