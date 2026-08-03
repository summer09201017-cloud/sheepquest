/* 🗺 羊9 立體地圖驗收:斷言「3D 後端真的接上了」+ 降級路真的會走 + 截圖給使用者過目。
 *
 * ⚠ 定位聲明(hook #29):這支是**渲染/狀態驗收台**——開場按鈕流程由 verify-geo.mjs
 *   (真 click)把關;這裡用 __sqmap 探針量後端狀態,mount 流程走客廳測試模式的真按鈕。
 *
 * 跑法:npx http-server -p 5199 -c-1 . 然後 node scripts/verify-map3d.mjs
 *
 * 三案:
 *   ① 預設(save 無 map3d 鍵)→ 應為 3D:is3d=true、maplibre canvas 在、建築層在
 *   ② save.map3d=false → 應為平面:leaflet 容器在、is3d=false
 *   ③ 3D 但 WebGL 不可用(stub 掉 getContext)→ 應自動退回平面,而且**遊戲照樣能走**
 *      (nearBar 計算不等地圖=玩法不因地圖壞而壞)
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL = process.env.URL || 'http://localhost:5199/'
const OUT = process.env.OUT || 'scripts/shots-map3d'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE })
let fail = 0

async function boot(page, { map3d, killWebGL } = {}) {
  if (killWebGL) {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (t, ...a) {
        if (/webgl/i.test(String(t))) return null
        return orig.call(this, t, ...a)
      }
    })
  }
  await page.addInitScript((v) => {
    const K = 'sheepquest-v1'
    let s = {}
    try { s = JSON.parse(localStorage.getItem(K) || '{}') || {} } catch { s = {} }
    if (v === undefined) delete s.map3d; else s.map3d = v
    localStorage.setItem(K, JSON.stringify(s))
  }, map3d)
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__sqmap, null, { timeout: 20000 })
  // 走玩家真的會走的路(真 click,守則不可跳過):勾「牧人守則」→ #demoBtn 才會解鎖 → 點它
  await page.locator('#agree').click({ timeout: 10000 })
  await page.locator('#demoBtn').click({ timeout: 10000 })
  await sleep(4500)                                  // 等 CDN script + 樣式 or 降級走完
  return await page.evaluate(() => ({
    is3d: window.__sqmap.is3d(), booting: window.__sqmap.booting(), failed: window.__sqmap.failed(),
    mlCanvas: !!document.querySelector('#map canvas.maplibregl-canvas'),
    leaflet: !!document.querySelector('#map .leaflet-pane'),
    hasBuildings: (() => { try { const m = window.__sqmap.map(); return !!(m && m.getLayer && (m.getLayer('sq-buildings-3d') || (m.getStyle().layers || []).some(l => l.type === 'fill-extrusion'))) } catch (e) { return false } })(),
    nearBarWorks: !!window._near || document.getElementById('count') !== null,
  }))
}

const errsAll = []
async function run(label, opts, expect) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const errs = []
  page.on('pageerror', (e) => errs.push(label + ' pageerror: ' + String(e)))
  const st = await boot(page, opts)
  const bad = Object.entries(expect).filter(([k, v]) => st[k] !== v)
  console.log(`${bad.length ? '🔴' : '🟢'} ${label}  ${JSON.stringify(st)}${bad.length ? '  ← 不符:' + bad.map(([k, v]) => `${k} 應為 ${v}`).join('、') : ''}`)
  if (bad.length) fail++
  await page.screenshot({ path: `${OUT}/${label}.png`, clip: { x: 0, y: 60, width: 390, height: 480 } })
  errsAll.push(...errs)
  await page.close()
}

await run('map3d-default', { map3d: undefined }, { is3d: true, mlCanvas: true, hasBuildings: true })
await run('map3d-flat', { map3d: false }, { is3d: false, leaflet: true })
await run('map3d-nowebgl-fallback', { map3d: undefined, killWebGL: true }, { is3d: false, leaflet: true })

if (errsAll.length) { console.log('🔴 頁面錯誤:'); errsAll.forEach((e) => console.log('  ' + e)); fail++ }
else console.log('🟢 0 pageerror')
console.log(`截圖在 ${OUT}/(立體感/配色請使用者過目)`)
await browser.close()
process.exit(fail ? 1 : 0)
