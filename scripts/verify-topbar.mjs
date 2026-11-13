/* 📏 頂列兩排閘門 — 2026-08-27 立,2026-11-13 改兩排版
 *
 * 由來:index.html 的 CSS 註解寫著「量過:五個元件約 356px < 可用 370px」——
 *   **但沒有留下量法**。0827 我加了兩個元件(步數膠囊+計步鈕)、沒有重新量,
 *   結果 360/390/412 三種寬度全部溢出,📖 羊圈 每一種都被推出畫面外
 *   —— 而羊圈是收藏冊與明信片匣的唯一入口,看不到等於那兩個功能不存在。
 *   ★ 那句「量過」寫在我正在編輯的同一個檔案裡,我還是犯了 ⇒ 知識要變成會跑的東西。
 *
 * 1113 長輩友善改版:以前為了塞進一排,窄螢幕把字縮到 12px、按鈕約 33px 高。
 *   改成兩排(第一排 羊數+朗讀/音樂/羊圈;第二排 定位精度+計步+地名),這支閘門跟著改量:
 *   ① 每一顆都在畫面內(左右都不出界)
 *   ② 字 ≥14px;可以按的鈕高 ≥44px
 *   ③ 兩排不互相蓋、toast 不蓋兩排、操作提示不蓋第二排
 *   ④ 所有浮在地圖上的鈕(兩排、指南針、右側視角/縮放、底部列)兩兩不相交、也不超出畫面底
 *   ⑤ 頁面沒有橫向捲動
 *   直向 360/390/412 + 橫向 740×360 都量。
 *
 * ⚠ 一定要**強制顯示** 📍 精度膠囊、🚶 步數膠囊、地名膠囊、指南針、右側控制列、「帶回這隻羊」條再量:
 *   demo 模式沒有 GPS / 方位感測 ⇒ 它們是隱藏的,不強制顯示就會量到比真手機小的數字
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

let fail = 0
const bad = (msg) => { fail++; console.log("    🔴 " + msg) }
const b = await chromium.launch()
try {
  for (const [w, h] of [[360, 740], [390, 844], [412, 915], [740, 360]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } })
    await p.goto(base, { waitUntil: "load" }); await new Promise((r) => setTimeout(r, 800))
    await p.locator("#agree").check(); await p.locator("#demoBtn").click(); await new Promise((r) => setTimeout(r, 1500))
    await p.evaluate(() => {
      const show = (sel, d) => { const e = document.querySelector(sel); if (e) e.style.display = d }
      show("#accChip", "inline-block"); document.querySelector("#accVal").textContent = "128"
      show("#stepChip", "inline-block"); document.querySelector("#stepChip").textContent = "🚶 12,345 步"
      show("#placeChip", "inline-block"); document.querySelector("#placeChip").textContent = "🏞 敦化南路二段63巷 ›"
      show("#compass", "block"); show("#viewCtl", "flex"); show("#nearBar", "block")
      document.querySelector("#count").textContent = "100"
      document.querySelector("#toast").style.display = "none"   // demo 開場 toast 先收起來,下面單獨量
    })
    const r = await p.evaluate(() => {
      const vis = (e) => e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0
      const box = (e) => { const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height } }
      const name = (e) => "#" + (e.id || "") + ((e.textContent || "").trim().slice(0, 8) ? "「" + (e.textContent || "").trim().slice(0, 8) + "」" : "")
      const items = (sel) => [...document.querySelectorAll(sel)].filter(vis).filter((e) => !e.classList.contains("grow"))
      const row1 = items(".top > *"), row2 = items("#row2 > *")
      const desc = (e) => ({ n: name(e), tag: e.tagName, ...box(e), fs: parseFloat(getComputedStyle(e).fontSize) })
      const floats = [...row1, ...row2, ...items("#compass"), ...items("#viewCtl > *"), ...items(".bottom > *")].map(desc)
      const kb = document.querySelector("#kbHint"); const kbBox = vis(kb) ? box(kb) : null
      const t = document.querySelector("#toast"); t.style.display = "block"; t.textContent = "這一帶是「信義路五段150巷」——等一下就在這裡救羊"
      const toast = box(t); t.style.display = "none"
      return { row1: row1.map(desc), row2: row2.map(desc), floats, kbBox, toast,
        topBox: box(document.querySelector(".top")), row2Box: box(document.querySelector("#row2")),
        iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }
    })
    console.log(`\n=== ${w}×${h} ===`)
    console.log("  第一排:" + r.row1.map((i) => `${i.n} ${Math.round(i.w)}×${Math.round(i.h)} 字${i.fs}`).join(" | "))
    console.log("  第二排:" + r.row2.map((i) => `${i.n} ${Math.round(i.w)}×${Math.round(i.h)} 字${i.fs}`).join(" | "))
    for (const i of [...r.row1, ...r.row2]) {
      if (i.l < -0.5 || i.r > r.iw + 0.5) bad(`${i.n} 超出畫面(左 ${Math.round(i.l)} / 右 ${Math.round(i.r)},畫面寬 ${r.iw})`)
      if (i.fs < 14) bad(`${i.n} 字 ${i.fs}px < 14`)
      if (i.tag === "BUTTON" && i.h < 44 - 0.5) bad(`${i.n} 高 ${Math.round(i.h)}px < 44`)
    }
    const hit = (a, c) => a.l < c.r - 0.5 && c.l < a.r - 0.5 && a.t < c.b - 0.5 && c.t < a.b - 0.5
    for (let i = 0; i < r.floats.length; i++) {
      const a = r.floats[i]
      if (a.b > r.ih + 0.5 || a.t < -0.5) bad(`${a.n} 超出畫面上下(上 ${Math.round(a.t)} / 下 ${Math.round(a.b)},畫面高 ${r.ih})`)
      for (let j = i + 1; j < r.floats.length; j++) if (hit(a, r.floats[j])) bad(`${a.n} 和 ${r.floats[j].n} 疊在一起`)
    }
    const rowsHit = r.row1.some((a) => r.row2.some((c) => hit(a, c)))
    if (rowsHit) bad("第一排和第二排疊在一起")
    const vHit = (a, c) => !(a.b <= c.t || a.t >= c.b)
    const t1 = r.row1.some((x) => vHit(r.toast, x)), t2 = r.row2.some((x) => vHit(r.toast, x))
    if (t1 || t2) bad(`toast(上緣 ${Math.round(r.toast.t)}px)蓋住 ${t1 ? "第一排 " : ""}${t2 ? "第二排" : ""}`)
    else console.log(`  🍞 toast(上緣 ${Math.round(r.toast.t)}px)沒有蓋住兩排 🟢`)
    // ⌨ 操作提示只在有滑鼠的裝置出現、指南針只在有方位感測的手機出現 ⇒ 兩者不會同時在,不互比
    if (r.kbBox) for (const x of r.floats) {
      if (!x.n.startsWith("#compass") && hit(r.kbBox, x)) bad(`⌨ 操作提示和 ${x.n} 疊在一起`)
    }
    if (r.sw > r.cw) bad(`頁面橫向捲動:scrollWidth ${r.sw} > clientWidth ${r.cw}`)
    const bottoms = r.floats.filter((f) => f.n.startsWith("#viewChip") || f.n.startsWith("#zoom") || f.n.startsWith("#mapFs"))
    console.log("  右側控制:" + bottoms.map((i) => `${i.n} 上${Math.round(i.t)}~下${Math.round(i.b)}`).join(" | "))
    await p.close()
  }
} finally { await b.close(); srv.close() }
console.log("")
console.log(fail
  ? `🔴 頂列/浮動鈕不合格(${fail} 項)——不要再往那兩排塞東西;放不下先縮短文案或改排版,不是把字縮回去。`
  : "🟢 兩排頂列在 360/390/412 直向與 740×360 橫向都排得下:字 ≥14px、鈕 ≥44px、全部在畫面內、浮動鈕互不相疊。")
process.exitCode = fail ? 1 : 0
}
