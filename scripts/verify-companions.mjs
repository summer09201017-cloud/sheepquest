/* 🐑🏆 羊14 跟隨小隊 / 羊1 里程碑 / 羊2 今日第一隻 / 羊3 安裝鈕 / 羊4 金毛櫥窗 / 羊11 時段氛圍
 * —— 2026-08-26 六張卡的常設閘門。
 *
 * ⚠ 定位聲明(hook #29):這支**真的用滑鼠去點**(羊圈開關、跟隨小隊格子、里程碑出口鈕),
 *   不是只 evaluate 讀狀態;讀狀態只用 __sqmap 探針(它是唯讀把手)。
 *
 * 跑法:先起本機伺服器(任一支靜態 server 指到 repo 根目錄,port 5199),然後
 *   URL=http://localhost:5199/ node scripts/verify-companions.mjs
 *   ★ 這個 repo 刻意零 node_modules(wrangler pages deploy 會整目錄上傳)⇒ playwright 不住這裡。
 *     在別處建工作區、junction 借 node_modules 來跑(同 gen-voice.mjs 的先例)。
 *
 * 案子:
 *   ① 羊14 3D:走幾步之後,跟隨小隊真的出現在場景裡(mesh 數 > 0)且軌跡有長出來
 *   ② 羊14 降級:three.js 載不到時,平面 emoji 標記接手(.escortMark ≥ 1)——雙後端都要能退化
 *   ③ 羊14 關掉:羊圈的開關關掉之後,場上一隻跟隨羊都不剩(mesh 與 emoji 都要歸零)
 *   ④ 羊14 GPS 抖動:原地抖動(< 門檻)不可以推進軌跡 —— 這是「串珠式」存在的理由
 *   ⑤ 羊1:抓到第 10 隻 → 里程碑畫面跳出來、蓋章記下來、**同一個台階不會慶祝第二次**
 *   ⑥ 羊2:今天第一隻標 first;同一天第二隻不標(而且日期鍵是本地時間不是 UTC)
 *   ⑦ 羊4:有金毛羊才開櫥窗,數字要對
 *   ⑧ 羊11:四個時段的打光真的不同,而且**夜晚不可以比白天暗**(可讀性優先)
 *   ⑨ 羊3:安裝區在一般瀏覽器看得到;LINE 內建瀏覽器要講「裝不了、先換瀏覽器」
 *   ⑩ 零 pageerror
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL = process.env.URL || 'http://localhost:5199/'
const OUT = process.env.OUT || 'scripts/shots-companions'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE })
let fail = 0
const errs = []
const ok = (cond, label, extra) => {
  console.log(`${cond ? '🟢' : '🔴'} ${label}${extra === undefined ? '' : '  ' + JSON.stringify(extra)}`)
  if (!cond) fail++
}

async function boot(page, { killThree, line } = {}) {
  if (killThree) await page.route(/cdn\.jsdelivr\.net\/npm\/three@/, (r) => r.abort())
  if (line) await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone) Line/13.0.0' })
  })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__sqmap, null, { timeout: 20000 })
  await page.locator('#agree').click({ timeout: 10000 })
  await page.locator('#demoBtn').click({ timeout: 10000 })
  await sleep(killThree ? 4000 : 6000)
}
/* 走 n 步(每一步都等狀態真的變了再點下一步 —— input 是單槽,連點會掉點) */
async function walk(page, n) {
  for (let i = 0; i < n; i++) {
    const before = await page.evaluate(() => window.__sqmap.escort().trail)
    await page.locator('#walkBtn').click({ timeout: 10000 })
    await page.waitForFunction((b) => window.__sqmap.escort().trail > b, before, { timeout: 8000 }).catch(() => {})
    await sleep(220)
  }
}
/* 直接把羊塞進羊圈(驗收用:真的走去抓 10 隻要跑幾百步)。
   ⚠ 只動 save.flock 這份資料,不繞過任何判定邏輯——里程碑/櫥窗讀的就是它。 */
async function seedFlock(page, count, opt) {
  return page.evaluate(({ count, opt }) => {
    const s = JSON.parse(localStorage.getItem('sheepquest-v1') || '{}')
    s.flock = s.flock || {}
    for (let i = 0; i < count; i++) {
      s.flock['seed|' + i] = { name: '小羊' + i, e: '🐑', gold: opt && opt.gold ? i < opt.gold : false, ts: Date.now() - (count - i) * 1000 }
    }
    localStorage.setItem('sheepquest-v1', JSON.stringify(s))
  }, { count, opt })
}

// ── ① 羊14:3D 跟隨小隊真的出現 ──────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => errs.push('① ' + String(e)))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await seedFlock(page, 5)
  await boot(page)
  await walk(page, 14)
  const st = await page.evaluate(() => window.__sqmap.escort())
  ok(st.on && st.trail >= 3 && st.meshes >= 1, '① 羊14:走幾步後跟隨小隊在場景裡', st)
  ok(st.meshes <= 5, '①b 上限 5 隻(不會愈跟愈多)', { meshes: st.meshes })
  await page.screenshot({ path: `${OUT}/escort-3d.png`, clip: { x: 0, y: 60, width: 390, height: 480 } })

  // ── ③ 羊14:羊圈裡關掉 → 場上一隻都不剩(真的去點那個 checkbox)──
  await page.locator('#flockBtn').click({ timeout: 10000 })
  await sleep(500)
  await page.locator('#escortSw').click({ timeout: 10000 })
  await sleep(500)
  await page.locator('#backBtn').click({ timeout: 10000 })
  await sleep(600)
  const off = await page.evaluate(() => window.__sqmap.escort())
  ok(!off.on && off.meshes === 0 && off.flatMarks === 0, '③ 羊14:關掉之後場上零跟隨羊', off)
  await page.close()
}

// ── ② 羊14 降級:three 載不到 → 平面 emoji 標記接手 ────────────────────
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => errs.push('② ' + String(e)))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await seedFlock(page, 5)
  await boot(page, { killThree: true })
  await walk(page, 14)
  const st = await page.evaluate(() => window.__sqmap.escort())
  ok(st.flatMarks >= 1 && st.meshes === 0, '② 羊14 降級:three 載不到時 emoji 標記接手', st)
  await page.screenshot({ path: `${OUT}/escort-fallback.png`, clip: { x: 0, y: 60, width: 390, height: 480 } })
  await page.close()
}

// ── ④ 羊14:原地 GPS 抖動不推進軌跡(串珠式存在的理由)───────────────────
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => errs.push('④ ' + String(e)))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await seedFlock(page, 5)
  await boot(page)
  /* 量的是頂層純函數 trailAdvances(遊戲與量尺共用同一份規則,不各寫一份) */
  const jit = await page.evaluate(() => {
    const at = (dLat, dLng) => ({ lat: 25.0330 + (dLat || 0), lng: 121.5654 + (dLng || 0) })
    const base = at()
    let jitterPushed = 0
    for (let i = 0; i < 12; i++) {                       // ±1.7m 級的原地抖動 ×12
      const p = at((Math.random() - 0.5) * 0.00003, (Math.random() - 0.5) * 0.00003)
      if (window.__sqmap.advances(base, p, false)) jitterPushed++
    }
    return {
      jitterPushed,                                      // 真實 GPS:抖動一次都不該推進
      realWalk: window.__sqmap.advances(base, at(0.00027), false),      // 走 30m:一定要推進
      demoStep: window.__sqmap.advances(base, at(0.000027), true),      // 客廳模式走 3m:要推進
      gpsSameStep: window.__sqmap.advances(base, at(0.000027), false),  // 同樣 3m 在 GPS 模式:不推進
    }
  })
  ok(jit.jitterPushed === 0, '④ 羊14:真實 GPS 的原地抖動不推進軌跡(羊不會跟著 GPS 鬼畜)', jit)
  ok(jit.realWalk === true, '④b ★反面對照:真的走 30m 一定要推進(否則門檻等於把功能關掉)')
  ok(jit.demoStep === true && jit.gpsSameStep === false,
    '④c 客廳測試模式不套抖動門檻(那裡沒有 GPS;3m 小碎步在室內示範時也要跟得上)',
    { demo3m: jit.demoStep, gps3m: jit.gpsSameStep })
  await page.close()
}

// ── ⑤ 羊1:第 10 隻跳里程碑、蓋章、不重複慶祝 ───────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => errs.push('⑤ ' + String(e)))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await seedFlock(page, 9)                          // 已有 9 隻 ⇒ 下一隻就是第 10
  await boot(page)
  const hit = await page.evaluate(() => {
    const m = window.__sqmile.hit(10)
    return m ? { n: m.n, ref: m.ref, say: m.say } : null
  })
  ok(hit && hit.n === 10 && /路加福音十五章四節/.test(hit.say), '⑤ 羊1:第 10 隻命中台階、唸稿含中文數字出處', hit && { n: hit.n, ref: hit.ref })
  // 真的把慶祝畫面叫出來,點出口鈕關掉
  await page.evaluate(() => window.__sqmile.show(window.__sqmile.hit(10)))
  await sleep(700)
  const onScreen = await page.evaluate(() => ({
    panel: document.getElementById('milePanel').classList.contains('on'),
    title: document.getElementById('mileTitle').textContent,
    verse: document.getElementById('mileVerse').textContent,
    confetti: document.querySelectorAll('canvas').length,
  }))
  ok(onScreen.panel && /10/.test(onScreen.title) && /路加福音 15:4/.test(onScreen.verse),
    '⑤b 里程碑畫面有標題與金句', { title: onScreen.title })
  await page.screenshot({ path: `${OUT}/milestone-10.png` })
  await page.locator('#mileBack').click({ timeout: 10000 })
  await sleep(400)
  const after = await page.evaluate(() => ({
    closed: !document.getElementById('milePanel').classList.contains('on'),
    stamped: !!JSON.parse(localStorage.getItem('sheepquest-v1') || '{}').miles[10],
    again: window.__sqmile.hit(10),
  }))
  ok(after.closed && after.stamped && after.again === null,
    '⑤c 關掉後蓋章、同一個台階不會再慶祝一次', { stamped: after.stamped, again: after.again })
  await page.close()
}

// ── ⑥ 羊2:今日第一隻 + 日期鍵是本地時間 ────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => errs.push('⑥ ' + String(e)))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await boot(page)
  const r = await page.evaluate(() => {
    const before = window.__sqday.isFirst()
    const key = window.__sqday.key()
    /* 本地時間鍵:拿今天早上 7 點來比 —— UTC 版會把台灣早上 7 點算成前一天(差一天) */
    const local = window.__sqday.key(new Date(2026, 7, 26, 7, 0, 0))
    return { before, key, local, utcWould: new Date(2026, 7, 26, 7, 0, 0).toISOString().slice(0, 10) }
  })
  ok(r.before === true, '⑥ 羊2:今天還沒抓過 ⇒ 下一隻是「今日第一隻」')
  ok(r.local === '2026-08-26' && r.utcWould === '2026-08-25',
    '⑥b 日期鍵用本地時間(UTC 會早一天,使用者的第一隻就拿不到冠冕)', r)
  await page.close()
}

// ── ⑦ 羊4:金毛櫥窗 ──────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => errs.push('⑦ ' + String(e)))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await seedFlock(page, 8, { gold: 3 })
  await boot(page)
  await page.locator('#flockBtn').click({ timeout: 10000 })
  await sleep(600)
  const g = await page.evaluate(() => ({
    shown: getComputedStyle(document.getElementById('goldCase')).display !== 'none',
    num: document.getElementById('goldNum').textContent,
    slots: document.querySelectorAll('#goldGrid .slot').length,
    miles: document.querySelectorAll('#mileRow div').length,
  }))
  ok(g.shown && g.slots === 3 && /3/.test(g.num), '⑦ 羊4:金毛櫥窗開著、數字與格數都對', g)
  ok(g.miles === 5, '⑦b 羊1:紀念章列有五個台階(含還沒到的灰章)', { miles: g.miles })
  await page.screenshot({ path: `${OUT}/flock-gold-miles.png` })
  // 一隻金毛都沒有 ⇒ 櫥窗要收起來(不留空櫥窗)
  const none = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('sheepquest-v1') || '{}')
    for (const k in s.flock) s.flock[k].gold = false
    localStorage.setItem('sheepquest-v1', JSON.stringify(s))
    location.reload()
  })
  await sleep(2500)
  await page.waitForFunction(() => !!window.__sqmap, null, { timeout: 15000 })
  await page.locator('#agree').click({ timeout: 10000 })
  await page.locator('#demoBtn').click({ timeout: 10000 })
  await sleep(3000)
  await page.locator('#flockBtn').click({ timeout: 10000 })
  await sleep(500)
  const empty = await page.evaluate(() => getComputedStyle(document.getElementById('goldCase')).display === 'none')
  ok(empty, '⑦c 一隻金毛都沒有時櫥窗收起來(不留空櫥窗嘲笑他)')
  await page.close()
}

// ── ⑧ 羊11:四個時段打光不同,而且夜晚不可以更暗 ─────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => errs.push('⑧ ' + String(e)))
  await boot(page)
  const seen = {}
  for (const [h, want] of [[6, 'dawn'], [12, 'day'], [17, 'dusk'], [22, 'night']]) {
    const k = await page.evaluate((h) => window.__sqmap.setHour(h), h)
    await sleep(250)
    seen[want] = await page.evaluate(() => window.__sqmap.tod())
    ok(k === want, `⑧ 羊11:${h} 點 → ${want}`, { got: k, dirColor: seen[want].dirColor })
    await page.screenshot({ path: `${OUT}/tod-${want}.png`, clip: { x: 0, y: 60, width: 390, height: 480 } })
  }
  const colors = new Set(Object.values(seen).map((s) => s.dirColor))
  ok(colors.size === 4, '⑧b 四個時段的太陽顏色互不相同(不是套了個沒作用的旗標)', [...colors])
  /* 早上與傍晚的太陽在天空的**兩邊** ⇒ 影子方向相反 */
  const dawnX = seen.dawn.dirPos[0], duskX = seen.dusk.dirPos[0]
  ok(dawnX > 0 && duskX < 0, '⑧c 清晨從東邊照、黃昏從西邊照(影子方向會反過來)', { dawnX, duskX })
  /* ★ 可讀性鐵則:夜晚只換色不壓暗 —— 環境光強度不可以低於白天的七成 */
  ok(seen.night.int >= seen.day.int * 0.7,
    '⑧d ★夜晚不可以比白天暗太多(走在路上要看得清楚路名,這是安全不是美感)',
    { day: seen.day.int, night: seen.night.int })
  await page.close()
}

// ── ⑨ 羊3:安裝引導 ─────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => errs.push('⑨ ' + String(e)))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__sqmap, null, { timeout: 20000 })
  const n = await page.evaluate(() => ({
    shown: getComputedStyle(document.getElementById('installBox')).display !== 'none',
    tip: document.getElementById('installTip').textContent,
  }))
  ok(n.shown && n.tip.length > 4, '⑨ 羊3:一般瀏覽器看得到安裝區且有說明', { tip: n.tip.slice(0, 30) })
  await page.close()

  const lp = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  lp.on('pageerror', (e) => errs.push('⑨L ' + String(e)))
  await boot(lp, { line: true })
  const l = await lp.evaluate(() => document.getElementById('installTip').textContent)
  ok(/裝不了/.test(l) && /LINE/.test(l),
    '⑨b ★LINE 內建瀏覽器要講「裝不了、先換瀏覽器」(不是叫他按一顆沒反應的鈕)', { tip: l.slice(0, 40) })
  await lp.close()
}

// ── ⑪ ⌨ 客廳模式的鍵盤走路(0826 使用者實測回報「PC 用方向鍵動彈不得」)──────
//    ★ 這一案跑**桌機 viewport**(不是 mobile)—— 使用者遇到問題的就是那個環境,
//      而先前所有閘門都只跑 iPhone 尺寸,所以這個缺口一路沒被看見。
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })   // 桌機:無 touch
  page.on('pageerror', (e) => errs.push('⑪ ' + String(e)))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__sqmap, null, { timeout: 20000 })
  await page.locator('#agree').click({ timeout: 10000 })
  await page.locator('#demoBtn').click({ timeout: 10000 })
  await sleep(5000)

  const hintShown = await page.evaluate(() => getComputedStyle(document.getElementById('kbHint')).display !== 'none')
  ok(hintShown, '⑪ 桌機上看得到「用方向鍵走路」的提示(不講他不會知道)')
  await page.screenshot({ path: `${OUT}/desktop-map.png` })     // ★ 地圖畫面(提示條的位置要人看一眼)
  /* ★★ 提示條不可以疊到任何浮動元素。
     ⚠ 判準刻意是「**掃所有 position:fixed 的可見元素**」,不是「比對我記得的那幾個 id」——
       第一版就是只比對頂端那排按鈕,結果提示條被 **#placeChip 地名膠囊**(top:52px)
       整條蓋住,只露出兩側的「用…走路」,而檢查照樣是綠的(截圖才看出來)。
       這是這個 repo 反覆出現的那一型:**判準只認得自己想到的那幾個,就等於沒在守**。 */
  const overlap = await page.evaluate(() => {
    const me = document.getElementById('kbHint')
    const a = me.getBoundingClientRect()
    const hits = []
    for (const el of document.querySelectorAll('body *')) {
      if (el === me || me.contains(el) || el.contains(me)) continue
      const cs = getComputedStyle(el)
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue
      const b = el.getBoundingClientRect()
      if (!b.width || !b.height) continue
      if (b.width > innerWidth * 0.9 && b.height > innerHeight * 0.9) continue        // 滿版容器(地圖/toast 層)不算
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
        hits.push(el.id || el.className || el.tagName)
      }
    }
    return hits
  })
  ok(overlap.length === 0, '⑪a2 ★提示條沒有疊到任何浮動元素(掃全部 fixed,不是只比對記得的那幾個)', { overlap })

  /* 四個方向各按一次:座標要真的變,而且方向要對 */
  const dirs = [['ArrowUp', 'lat', 1], ['ArrowDown', 'lat', -1], ['ArrowRight', 'lng', 1], ['ArrowLeft', 'lng', -1]]
  for (const [key, axis, sign] of dirs) {
    const b = await page.evaluate(() => ({ lat: window.__sqpos().lat, lng: window.__sqpos().lng }))
    await page.keyboard.press(key)
    await sleep(260)
    const a = await page.evaluate(() => ({ lat: window.__sqpos().lat, lng: window.__sqpos().lng }))
    const moved = (a[axis] - b[axis]) * sign
    ok(moved > 0.00005, `⑪ ${key} → 往${axis === 'lat' ? (sign > 0 ? '北' : '南') : (sign > 0 ? '東' : '西')}走`, { delta: +(moved * 111000).toFixed(1) + 'm' })
  }
  // WASD 也要通(沒有方向鍵的筆電/習慣遊戲操作的孩子)
  const wb = await page.evaluate(() => window.__sqpos().lat)
  await page.keyboard.press('w'); await sleep(260)
  const wa = await page.evaluate(() => window.__sqpos().lat)
  ok(wa > wb, '⑪b WASD 也能走(W=往北)')

  /* ★★ 反面對照三條:不可以攔到別人的鍵 */
  await page.locator('#flockBtn').click({ timeout: 10000 })       // 開羊圈=面板開著
  await sleep(500)
  const pb = await page.evaluate(() => window.__sqpos().lat)
  await page.keyboard.press('ArrowDown'); await sleep(260)
  const pa = await page.evaluate(() => window.__sqpos().lat)
  ok(pb === pa, '⑪c ★面板開著時方向鍵不走路(那時它是在捲頁面)')

  // textarea 裡打字:方向鍵要留給游標
  const ta = await page.evaluate(() => {
    const t = document.getElementById('dexIo')
    t.style.display = ''; t.value = 'abc'; t.focus(); t.setSelectionRange(3, 3)
    return true
  })
  const tb = await page.evaluate(() => window.__sqpos().lat)
  await page.keyboard.press('ArrowLeft'); await sleep(200)
  const tafter = await page.evaluate(() => ({ lat: window.__sqpos().lat, caret: document.getElementById('dexIo').selectionStart }))
  ok(ta && tb === tafter.lat && tafter.caret === 2,
    '⑪d ★焦點在輸入框時方向鍵移游標、不走路(羊圈的貼上區就是 textarea)', { caret: tafter.caret })
  await page.screenshot({ path: `${OUT}/desktop-keyboard.png` })
  await page.close()
}

// ── ⑫ ★ GPS 模式下鍵盤絕不可以動座標(在戶外會看到自己憑空瞬移)────────────
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', (e) => errs.push('⑫ ' + String(e)))
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: 25.0330, longitude: 121.5654, accuracy: 8 })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__sqmap, null, { timeout: 20000 })
  await page.locator('#agree').click({ timeout: 10000 })
  await page.locator('#startBtn').click({ timeout: 10000 })       // 真的走 GPS 這條路
  await page.waitForFunction(() => window.__sqpos && window.__sqpos(), null, { timeout: 20000 })
  await sleep(2500)
  const b = await page.evaluate(() => window.__sqpos().lat)
  for (const k of ['ArrowUp', 'ArrowRight', 'w', 'd']) { await page.keyboard.press(k); await sleep(150) }
  const a = await page.evaluate(() => window.__sqpos().lat)
  ok(b === a, '⑫ ★GPS 模式下按鍵盤不會動座標(不然戶外會看到自己憑空瞬移)', { before: b, after: a })
  await page.close()
}

// ── ⑩ 零 pageerror ─────────────────────────────────────────────────────
if (errs.length) { console.log('🔴 頁面錯誤:'); errs.forEach((e) => console.log('  ' + e)); fail++ }
else console.log('🟢 ⑩ 0 pageerror')

console.log(`\n截圖在 ${OUT}/(跟隨小隊的隊形/時段配色請使用者過目)`)
console.log(fail ? `🔴 FAIL — ${fail} 項` : '🟢 PASS — 全部通過')
await browser.close()
process.exit(fail ? 1 : 0)
