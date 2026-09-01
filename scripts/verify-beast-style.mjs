/* eval-click:ok —— 這支是**純渲染截圖台**:只驗畫面長相(姿勢/材質/觀眾),不驗 UI 流程,
 * 所以刻意不點任何按鈕。「按鈕看得見、點得到」由同 repo 走真 click 的那支驗收把關。
 * (2026-09-01:hook #29 evaluate-not-click-guard 新增這個機器讀得懂的放行標記;
 *  在此之前它每次被編輯都會吠一次,而假警報的下場是「反正它老是跳,無視它」。) */
/* 😾 兇猛獸驗收:兩版都要造得出來、合約沒破、四案截圖給使用者過目 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const URL = process.env.URL || 'http://localhost:5199/'
const OUT = 'scripts/shots-beast'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const errs = []; page.on('pageerror', e => errs.push(String(e)))
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__sq3d, null, { timeout: 20000 })
let fail = 0
for (const [fierce, kind] of [[true,'lion'],[true,'wolf'],[true,'bear'],[false,'lion']]) {
  await page.evaluate(({f}) => { const K='sheepquest-v1'; let s={}; try{s=JSON.parse(localStorage.getItem(K)||'{}')||{}}catch{}; s.beastFierce=f; localStorage.setItem(K,JSON.stringify(s)) }, {f:fierce})
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__sq3d, null, { timeout: 20000 })
  const ok = await page.evaluate(k => window.__sq3d.mount(k), kind)
  if (!ok) { console.log('🔴 mount 失敗', kind); fail++; continue }
  await page.evaluate(() => document.getElementById('catchPanel')?.classList.add('on'))
  await sleep(1300)
  const p = await page.evaluate(() => { const q = window.__sq3d.probe(); return { beastHead: q.beastHead, mats: q.mats } })
  const label = (fierce?'fierce':'tsum')+'-'+kind
  const okc = !!p.beastHead
  console.log(`${okc?'🟢':'🔴'} ${label}  beastHead=${JSON.stringify(p.beastHead)} toon=${p.mats.toon}`)
  if (!okc) fail++
  const el = await page.$('#b3d'); if (el) await el.screenshot({ path: `${OUT}/${label}.png` })
}
console.log(errs.length ? '🔴 pageerror: '+errs.join(' | ') : '🟢 0 pageerror')
if (errs.length) fail++
await browser.close(); process.exit(fail?1:0)
