/* 🗺 羊10 驗收:3D 牧人與羊群真的站在立體地圖上 + 降級路仍然完好。
 *
 * ⚠ 定位聲明(hook #29):渲染/狀態驗收台;開場按鈕流程由 verify-geo.mjs(真 click)把關。
 *   這裡仍走玩家的真路徑(勾守則 → 點客廳測試模式),只有讀狀態用 __sqmap 探針。
 *
 * 跑法:npx http-server -p 5199 -c-1 . 然後 node scripts/verify-map-chars.mjs
 *   SCALE=<數字> 可覆寫人物大小重拍(調整比例時用)
 *
 * 三案:
 *   ① 立體+人物:chars.ready=true、有牧人、羊 ≥1、DOM emoji 標記已收掉(不可兩套並存)
 *   ② 走一步:走路動畫時間窗打開(walking=true)——證明「會動」不是靜止擺設
 *   ③ three.js 載不到:人物層不上,但立體地圖與 emoji 標記照常(玩法不因漂亮而壞)
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL = process.env.URL || 'http://localhost:5199/'
const OUT = process.env.OUT || 'scripts/shots-map3d'
const SCALE = process.env.SCALE ? Number(process.env.SCALE) : null
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE })
let fail = 0
const errsAll = []

async function boot(page, { killThree } = {}) {
  if (killThree) {
    // 只擋 three.js 的 CDN(地圖的 maplibre 要留著)——這才是「人物載不到但地圖還在」的真情境
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@/, (r) => r.abort())
  }
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__sqmap, null, { timeout: 20000 })
  await page.locator('#agree').click({ timeout: 10000 })
  await page.locator('#demoBtn').click({ timeout: 10000 })
  await sleep(6000)                                  // maplibre 樣式 + three 模組 + 首次 syncChars
}

async function snap(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: 60, width: 390, height: 480 } })
}

// ── ① 立體 + 3D 人物 ──
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => errsAll.push('① pageerror: ' + String(e)))
  await boot(page)
  if (SCALE) { await page.evaluate((s) => window.__sqmap.setScale(s), SCALE); await sleep(900) }
  const st = await page.evaluate(() => ({
    is3d: window.__sqmap.is3d(), ...window.__sqmap.chars(),
    domSheepMarks: document.querySelectorAll('.sheepMark').length,
    domYouMark: document.querySelectorAll('.youMark').length,
  }))
  const ok = st.is3d && st.ready && st.shep && st.sheep >= 1 && st.domSheepMarks === 0 && st.domYouMark === 0
  console.log(`${ok ? '🟢' : '🔴'} ① 立體+3D人物  ${JSON.stringify(st)}`)
  if (!ok) fail++
  await snap(page, 'chars-3d')

  // ── ② 走一步 → 走路動畫時間窗要打開 ──
  await page.locator('#walkBtn').click({ timeout: 10000 })
  await sleep(300)
  const w = await page.evaluate(() => window.__sqmap.chars())
  console.log(`${w.walking ? '🟢' : '🔴'} ② 走一步有走路動畫  ${JSON.stringify(w)}`)
  if (!w.walking) fail++
  await snap(page, 'chars-3d-walk')
  await page.close()
}

// ── ③ three.js 載不到 → 人物層不上,地圖與 emoji 標記照常 ──
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => errsAll.push('③ pageerror: ' + String(e)))
  await boot(page, { killThree: true })
  const st = await page.evaluate(() => ({
    is3d: window.__sqmap.is3d(), ready: window.__sqmap.chars().ready,
    domSheepMarks: document.querySelectorAll('.sheepMark').length,
    nearBarWorks: document.getElementById('count') !== null,
  }))
  const ok = st.is3d && !st.ready && st.domSheepMarks >= 1 && st.nearBarWorks
  console.log(`${ok ? '🟢' : '🔴'} ③ three 載不到→保留 emoji 標記  ${JSON.stringify(st)}`)
  if (!ok) fail++
  await snap(page, 'chars-nothree-fallback')
  await page.close()
}

if (errsAll.length) { console.log('🔴 頁面錯誤:'); errsAll.forEach((e) => console.log('  ' + e)); fail++ }
else console.log('🟢 0 pageerror')
console.log(`截圖在 ${OUT}/(人物大小/立體感請使用者過目;調大小:SCALE=20 node scripts/verify-map-chars.mjs)`)
await browser.close()
process.exit(fail ? 1 : 0)
