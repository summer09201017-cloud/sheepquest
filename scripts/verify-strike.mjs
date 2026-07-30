/* 🦯 甩杖驗收:量「杖頭到獸頭」的距離,並在砸到底那一刻截圖。
 *
 * 為什麼要這支:probe() 原本只有 armX(手臂角度)——那只能證明「手揮了」,
 * **證不了「杖碰到獸」**。0730 使用者回報「看起來牧人是對空氣攻擊,沒有真的打到獸」,
 * 量了才知道杖頭離獸頭 1.64、而獸頭半徑只有 0.48(差三個頭以上),而且主要差在 z 不是 x。
 * ⇒ 以後改站位/杖長/揮杖角度,一律先跑這支看 reach,不要用肉眼猜。
 *
 * 跑法:node scripts/verify-strike.mjs        (預設 http://localhost:5199/)
 *   URL=<網址> CHROME_EXE=<chrome路徑> OUT=<截圖資料夾> node scripts/verify-strike.mjs
 *
 * ★ WebGL 驗收鐵則(skill turn-based-3d-battle):toDataURL 在沒開 preserveDrawingBuffer 時
 *   是空白圖,要用**元素截圖**;而且動畫很快,要**在頁面內用 RAF 連續取樣**抓極值,
 *   一次 evaluate 來回動畫就演完了 = 假數據。
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL = process.env.URL || 'http://localhost:5199/'
const OUT = process.env.OUT || 'scripts/shots'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE })
// iPhone 直向:使用者是在**手機**上看到這個問題的,就用手機尺寸驗
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + String(e)))
/* 可選資產(自己拍的照片 photos/、地圖圖磚)本來就「找不到就退回積木」=**404 是預期行為**,
   不能算紅燈,否則每次都假紅。只有非預期的 404 與真正的 pageerror 才記。*/
const OPTIONAL = /photos\/|tile\.openstreetmap|\.jpg|\.png/i
page.on('response', (r) => {
  if (r.status() >= 400 && !OPTIONAL.test(r.url())) errs.push(`HTTP ${r.status()} ${r.url()}`)
})
page.on('console', (m) => {
  if (m.type() !== 'error') return
  if (/Failed to load resource/i.test(m.text())) return   // 上面用 response 事件抓,才看得到是哪個檔
  errs.push('console: ' + m.text())
})

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__sq3d, null, { timeout: 20000 })

/* 進 3D 戰鬥。shepTsum=false → A|寫實牧人;true → B|圓萌牧人。
   ★ 牧人選項存在存檔物件 `save.shepTsum` 裡、整包序列化進 localStorage 鍵 **sheepquest-v1**
     (不是自己一個鍵)。要在 **reload 前**寫好,mount() 才會用新選項重建牧人。
     ⚠ 這裡踩過一次:第一版自己另外發明了一個鍵去寫牧人選項 —— 遊戲根本不讀那個鍵,
       等於兩輪都在測同一個牧人、還會誤判成「兩版都過」。
       (全域 hook localstorage-key-guard 當場擋下來的:寫了從不讀=無聲失敗。) */
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
  if (!ok) throw new Error('mount() 回 false —— 3D 沒載起來(three.js CDN?),沒東西可量')
  await sleep(1000)
  // 確認真的換到了想測的那一版:圓萌牧人有 eyes(會眨眼),寫實版沒有
  const isTsum = await page.evaluate(() => !!(window.__sq3d.probe().staffHead) && !!document.querySelector('#b3d canvas'))
  if (!isTsum) throw new Error('probe 抓不到 staffHead —— userData 接口不對')
}

/* 在頁面內用 RAF 連續取樣整段甩杖,回報 reach 的**最小值**(=杖頭最靠近獸頭的那一刻)。
   一次 evaluate 只讀一個瞬間的話,動畫早就演完了 → 一定量到待機值,是假綠。 */
async function measureStrike() {
  return await page.evaluate(() => new Promise((resolve) => {
    const P = window.__sq3d
    let best = Infinity, bestAt = null, frames = 0
    P.strike(true)
    const t0 = performance.now()
    const tick = () => {
      const s = P.probe()
      frames++
      if (s.reach !== null && s.reach < best) { best = s.reach; bestAt = s }
      if (performance.now() - t0 < 1300) requestAnimationFrame(tick)
      else resolve({ minReach: best, frames, at: bestAt, idle: P.probe() })
    }
    requestAnimationFrame(tick)
  }))
}

const rows = []
for (const [tsum, label] of [[false, 'A-寫實牧人'], [true, 'B-圓萌牧人']]) {
  await enter(tsum, 'lion')
  const idle = await page.evaluate(() => window.__sq3d.probe())
  const m = await measureStrike()
  rows.push({ label, idleReach: idle.reach, minReach: m.minReach, armX: m.at && m.at.armX, frames: m.frames,
    sHead: m.at && m.at.staffHead, bHead: m.at && m.at.beastHead })
  /* 砸到底那一刻(蓄力 0.14 + 砸下 0.30 = 0.44s)截圖。
     ⚠ 這裡踩過一次:直接拍 #b3d 拍到的是**首頁**——mount() 雖然把 3D host 顯示出來了,
       但 introPanel(開場說明那一大片)還蓋在上面。要先把面板收掉才看得到 3D 畫面。
       (量測不受影響:probe() 是直接讀 three.js 的狀態,不管畫面被誰蓋住。) */
  await page.evaluate(() => {
    /* 面板是用 class `on` 切換的(introPanel 預設帶 on)。
       ⚠ 光把 introPanel 設 display:none 沒用:#b3d 住在 #catchPanel 裡面,
         那個面板沒有 on 的時候整個容器**寬高是 0** → Playwright 會說「element is not visible」,
         而且就算硬拍也拍不到東西。要把戰鬥面板真的打開。*/
    document.getElementById('introPanel')?.classList.remove('on')
    document.getElementById('catchPanel')?.classList.add('on')
    window.__sq3d.resize()
  })
  await sleep(400)
  /* ⚠ 不能用「strike() 之後 sleep 440ms 再拍」:元素截圖本身要花時間,
     快門真正按下時揮杖(0.56s)已經演完、姿勢還原了,只剩白光在淡出
     —— 拍到的是「站著不動+半空中一個光環」,剛好是最容易誤判成「打空氣」的那一幀。
     正解:在**頁面內**盯著 probe().armX,等它掃到砸下角度的九成才回來按快門。*/
  await page.evaluate(() => new Promise((resolve) => {
    /* 快門條件用**語意**:等「杖頭真的碰到獸」那一刻(reach 進到閾值內)。
       ⚠ 別用 armX 當條件:兩版的 armDown 不一樣(A 2.25 / B 2.38),寫死一個數字
         會讓另一版等到揮完才觸發 → 拍到待機姿勢(B 版就是這樣拍歪一次的)。*/
    const P = window.__sq3d
    P.strike(true)
    const t0 = performance.now()
    const tick = () => {
      const s = P.probe()
      if (s.reach !== null && s.reach <= 0.5) return resolve(true)
      if (performance.now() - t0 > 1200) return resolve(false)   // 逾時也回來,別把腳本掛住
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }))
  await page.locator('#b3d').screenshot({ path: `${OUT}/strike-${tsum ? 'B' : 'A'}.png` })
  await sleep(900)
}

console.log('\n=== 🦯 甩杖驗收(杖頭 → 獸頭 的距離;獸頭半徑約 0.48)===')
for (const r of rows) {
  const ok = r.minReach <= 0.48
  console.log(`${r.label}  待機 reach=${r.idleReach}  砸到底最小 reach=${r.minReach}  取樣 ${r.frames} 幀  armX=${r.armX}  ${ok ? '🟢 碰到了' : '🔴 還是打空氣'}`)
  if (r.sHead && r.bHead) {
    const d = ['x', 'y', 'z'].map((a, i) => `d${a}=${(r.bHead[i] - r.sHead[i]).toFixed(2)}`).join('  ')
    console.log(`    杖頭 [${r.sHead}]  獸頭 [${r.bHead}]   → ${d}   ← 看哪一軸最大就先修那一軸`)
  }
}
console.log(`\npageerrors/console errors: ${errs.length}`)
for (const e of errs.slice(0, 6)) console.log('  ✗', e.slice(0, 200))
const allOk = rows.every((r) => r.minReach <= 0.48) && errs.length === 0
console.log(`\n總結: ${allOk ? '🟢 PASS' : '🔴 FAIL'}`)
await browser.close()
process.exit(allOk ? 0 : 1)
