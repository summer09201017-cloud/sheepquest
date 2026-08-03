/* 🎨 羊8 卡通化驗收:斷言「戰鬥場景真的換成卡通材質」+ 各獸各牧人截圖給使用者過目。
 *
 * ⚠ 定位聲明(回應 hook #29 evaluate-not-click-guard):這支是**純渲染截圖台**——
 *   只驗「材質真的換了+畫面長什麼樣」,不驗 UI 流程;「按鈕看得見、點得到」由
 *   verify-geo.mjs(真 click 走完開場)把關,兩支分工、不重疊。mount() 直呼是刻意的
 *   (與 verify-strike.mjs 同款做法:量的是 3D 世界,不是按鈕)。
 *
 * 為什麼要這支:改材質是「畫面事」,測試全綠 ≠ 畫面對(本 repo 的老教訓)。
 * 但反過來「只看截圖」也不行——顏色變沒變肉眼常騙人(silent-failure-patterns §⑥)。
 * 所以兩軌:① probe().mats 斷言 toon 數量(硬數字)② 元素截圖(給使用者看可不可愛;
 *   可愛不可愛使用者說了算,不是 AI 說了算)。
 *
 * 跑法:npx http-server -p 5199 -c-1 . 然後 node scripts/verify-toon.mjs
 *   URL=<網址> OUT=<截圖資料夾> node scripts/verify-toon.mjs
 *
 * 斷言:
 *   - mats.toon ≥ 20(牧人+羊+獸+背景積木都換過去了;實測 lion 場約 40+)
 *   - mats.lambert ≤ 3(只剩 ground 與貼圖類的刻意保留)
 *   - 0 pageerror
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL = process.env.URL || 'http://localhost:5199/'
const OUT = process.env.OUT || 'scripts/shots-toon'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + String(e)))
const OPTIONAL = /photos\/|tile\.openstreetmap|basemaps|\.jpg|\.png/i
page.on('response', (r) => {
  if (r.status() >= 400 && !OPTIONAL.test(r.url())) errs.push(`HTTP ${r.status()} ${r.url()}`)
})

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__sq3d, null, { timeout: 20000 })

async function enter(tsum, kind) {
  await page.evaluate(({ tsum }) => {
    const K = 'sheepquest-v1'
    let s = {}
    try { s = JSON.parse(localStorage.getItem(K) || '{}') || {} } catch { s = {} }
    s.shepTsum = tsum
    localStorage.setItem(K, JSON.stringify(s))
  }, { tsum })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__sq3d, null, { timeout: 20000 })
  const ok = await page.evaluate((kind) => window.__sq3d.mount(kind), kind)
  if (!ok) throw new Error('mount() 回 false —— 3D 沒載起來(three.js CDN?)')
  /* ⚠ repo 老陷阱(verify-strike 註解記著):#b3d 住在 #catchPanel 裡,
     面板沒 class `on` 時容器寬高是 0 → 截圖永遠 timeout「element is not visible」。 */
  await page.evaluate(() => document.getElementById('catchPanel')?.classList.add('on'))
  await sleep(1200)                                    // 等 three 首幀 + 材質套完
  return await page.evaluate(() => window.__sq3d.probe())
}

let fail = 0
const CASES = [
  [false, 'lion', 'A寫實+獅'],
  [false, 'wolf', 'A寫實+狼'],
  [true, 'bear', 'B圓萌+熊'],
  [true, 'lion', 'B圓萌+獅'],
]
for (const [tsum, kind, label] of CASES) {
  const p = await enter(tsum, kind)
  const m = p && p.mats
  const okToon = m && m.toon >= 20
  const okLam = m && m.lambert <= 3
  console.log(`${okToon && okLam ? '🟢' : '🔴'} ${label}  toon=${m ? m.toon : '?'} lambert=${m ? m.lambert : '?'} other=${m ? m.other : '?'}`)
  if (!okToon || !okLam) fail++
  const el = await page.$('#b3d')
  if (el) await el.screenshot({ path: `${OUT}/toon-${tsum ? 'B' : 'A'}-${kind}.png` })
}

if (errs.length) { console.log('🔴 頁面錯誤:'); errs.forEach((e) => console.log('   ' + e)); fail++ }
else console.log('🟢 0 pageerror / 0 非預期 4xx')
console.log(`截圖在 ${OUT}/(可愛不可愛請使用者過目——AI 只驗「真的換了材質」)`)
await browser.close()
process.exit(fail ? 1 : 0)
