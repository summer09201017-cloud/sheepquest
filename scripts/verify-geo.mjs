/* 📍 定位健檢閘門 — 2026-07-31
 *
 * 由來:使用者在**戶外**按「📍 用 GPS 開始找羊」每次都跳「拿不到定位(要允許權限)」→ 根本玩不了。
 *   根因不是權限,是 startGPS 舊碼 `timeout: 10000` 太短(enableHighAccuracy + maximumAge 0
 *   = 強迫重開 GPS 取新 fix,戶外冷啟動 15~45 秒),而 code 1/2/3 三種錯誤全被講成「要允許權限」。
 *
 * ★ 這支的價值:把「只有真手機在外面才會遇到」的三種情況(慢定位 / 權限被拒 / 收不到訊號)
 *   用 stub 在桌機重現 —— 以後動 startGPS / beginPlay / geoErrHtml 先跑這支,
 *   別再靠「拿手機出門走一趟」才知道壞了。舊版在情境 A 必定 FAIL(10 秒就放棄)。
 *
 * 跑法:先 `npx http-server -p 5199 -c-1 .`,再
 *   URL=http://127.0.0.1:5199/ node scripts/verify-geo.mjs
 * 也可對線上網址跑(記得 Cache-Control: no-cache 才拿得到剛部署的版本)。
 */
import { chromium } from "playwright"

const URL_ = process.env.URL || "http://127.0.0.1:5199/"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* 覆寫 navigator.geolocation:mode 決定「什麼時候回什麼」。
   ★ 必須在頁面 script 跑之前注入(addInitScript),否則 startGPS 抓到的是真 API。 */
function stub(mode) {
  return `(() => {
    const P = (acc) => ({ coords: { latitude: 25.033, longitude: 121.5654, accuracy: acc }, timestamp: Date.now() });
    const E = (code) => ({ code, message: 'stub code ' + code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    const M = ${JSON.stringify(mode)};
    let wid = 0;
    const G = {
      /* 這支是「快取搶開場」那一路 */
      getCurrentPosition(ok, err) {
        if (M === 'denied') return setTimeout(() => err && err(E(1)), 30);
        if (M === 'cachedGood') return setTimeout(() => ok(P(50)), 200);
        if (M === 'cachedCoarse') return setTimeout(() => ok(P(500)), 200);   // ±500m:規則上不該採用
        return setTimeout(() => err && err(E(2)), 300);                       // 沒有快取位置
      },
      /* 這支是主力 watch */
      watchPosition(ok, err) {
        const id = ++wid;
        if (M === 'denied') setTimeout(() => err && err(E(1)), 40);
        else if (M === 'nosignal') { setTimeout(() => err && err(E(2)), 500); setTimeout(() => err && err(E(2)), 3500) }
        else if (M === 'slow') setTimeout(() => ok(P(12)), 20000);            // 20 秒才有第一筆(舊版已死)
        else if (M === 'cachedGood') setTimeout(() => ok(P(8)), 25000);
        else if (M === 'cachedCoarse') setTimeout(() => ok(P(10)), 6000);
        else setTimeout(() => ok(P(9)), 300);                                 // fast
        return id;
      },
      clearWatch() {},
    };
    Object.defineProperty(navigator, 'geolocation', { value: G, configurable: true });
    if (navigator.permissions) {
      const state = M === 'denied' ? 'denied' : 'granted';
      Object.defineProperty(navigator.permissions, 'query', {
        value: (d) => Promise.resolve({ state: d && d.name === 'geolocation' ? state : 'granted', onchange: null }),
        configurable: true, writable: true,
      });
    }
  })()`
}

/* 讀畫面上「玩家看得到的事實」——不是讀內部變數,避免自我驗證。
   ★ 元素不存在要回 false,不可以讓 getComputedStyle(null) 直接爆掉:
     否則「拿舊版跑一次確認新測試會 FAIL」時得到的是一個崩潰,不是一條看得懂的紅燈。 */
const snap = (p) => p.evaluate(() => {
  const shown = (id) => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== "none" }
  return ({
  intro: document.getElementById("introPanel").classList.contains("on"),
  geoTxt: (document.getElementById("geoStatus").innerText || "").replace(/\s+/g, " ").trim(),
  geoShown: shown("geoStatus"),
  accShown: shown("accChip"),
  acc: document.getElementById("accVal").textContent,
  /* 🧪 0731:等待框下面那顆「改用客廳測試模式」出口鈕 */
  outShown: shown("geoDemoOut"),
  walkShown: shown("walkBtn"),
})})

async function open(mode) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const errs = []
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message))
  await page.addInitScript(stub(mode))
  await page.goto(URL_, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("#startBtn")
  await page.evaluate(() => {
    const a = document.getElementById("agree")
    a.checked = true
    a.dispatchEvent(new Event("change"))
  })
  await page.locator("#startBtn").click()
  return { page, errs }
}

const results = []
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "🟢" : "🔴"} ${name}${detail ? " — " + detail : ""}`) }

const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE })

/* ══ A. 慢定位:20 秒才有第一筆 fix。這是使用者實際遇到的那一種。 ══ */
{
  const { page, errs } = await open("slow")
  await sleep(12000)
  const mid = await snap(page)
  check("A1 等待期沒有假失敗(12 秒時還在數秒、面板還開著)",
    mid.intro && /正在定位/.test(mid.geoTxt) && !/權限/.test(mid.geoTxt),
    `「${mid.geoTxt.slice(0, 46)}…」`)
  await sleep(10500)
  const end = await snap(page)
  check("A2 ★慢定位最後成功開場(舊版 10 秒就放棄=玩不了)",
    !end.intro && end.accShown && end.acc === "12", `精度顯示 ±${end.acc}m`)
  check("A3 無 pageerror", errs.length === 0, errs.slice(0, 2).join(" | "))
  await page.close()
}

/* ══ B. 權限真的被拒絕:才可以講權限,而且要給得出「怎麼開」 ══ */
{
  const { page } = await open("denied")
  await sleep(1500)
  const s = await snap(page)
  check("B1 權限被拒時講權限,並附 iPhone/Android 開法",
    s.intro && /權限被拒絕/.test(s.geoTxt) && /iPhone/.test(s.geoTxt) && /Android/.test(s.geoTxt))
  check("B2 提醒「主畫面圖示是另一份權限」(iOS PWA 的坑)", /主畫面/.test(s.geoTxt))
  await page.close()
}

/* ══ C. 收不到訊號(code 2):不可誤報成權限,且要繼續試 ══ */
{
  const { page } = await open("nosignal")
  await sleep(5000)
  const s = await snap(page)
  check("C1 code 2 講「收不到訊號」而不是「權限」",
    /收不到定位訊號/.test(s.geoTxt) && !/權限被拒絕/.test(s.geoTxt))
  check("C2 仍在數秒重試、沒有把面板關掉", s.intro && /正在定位/.test(s.geoTxt))
  await page.close()
}

/* ══ D. 快取位置搶開場:夠準的先玩,太粗的不採用 ══ */
{
  const { page } = await open("cachedGood")
  await sleep(1800)
  const s = await snap(page)
  check("D1 有 ±50m 的快取位置 → 2 秒內就開場(不用乾等 GPS)", !s.intro && s.acc === "50")
  await page.close()
}
{
  const { page } = await open("cachedCoarse")
  await sleep(2200)
  const a = await snap(page)
  check("D2 ±500m 太粗 → 不拿來開場(否則羊會整批搬家)", a.intro && /正在定位/.test(a.geoTxt))
  await sleep(5000)
  const b = await snap(page)
  check("D3 等到 ±10m 的 GPS fix 才開場", !b.intro && b.acc === "10")
  await page.close()
}

/* ══ E. 一切正常:不該有任何多餘的等待畫面 ══ */
{
  const { page, errs } = await open("fast")
  await sleep(1200)
  const s = await snap(page)
  check("E1 定位很快時直接開場、等待框收起來", !s.intro && !s.geoShown && s.acc === "9")
  check("E2 無 pageerror", errs.length === 0, errs.slice(0, 2).join(" | "))
  await page.close()
}

/* ══ F. 🧪 出口鈕(v13,使用者拍板):等定位的時候可以直接改用客廳測試模式 ══
   為什麼要有這一段:v12 只在**第 40 秒**用文字提「可以先用測試模式」,而桌機/室內的人
   那 40 秒完全是白等的。★ 三項都**真的去 click 那顆鈕**,不是用 evaluate 呼叫 enterDemoMode()
   —— 這一系列最貴的 bug(「帶回這隻羊」鈕上線兩天從來沒出現過)就是敗在「只 evaluate 不 click」。*/
{
  const { page, errs } = await open("slow")
  await sleep(1500)
  const a = await snap(page)
  check("F1 ★等待一開始(1.5 秒)出口鈕就看得見,不必等到第 40 秒",
    a.intro && /正在定位/.test(a.geoTxt) && a.outShown)

  /* ← 真的按下去(不可改用 evaluate 呼叫 enterDemoMode:那樣就算按鈕根本沒顯示也會「通過」)。
       ★ 短 timeout + catch:按不到就往下讓 F2 判紅,不要整支崩在 30 秒的預設等待上
         —— 拿舊版跑迴歸時走的正是這條路。 */
  const clicked = await page.locator("#geoDemoBtn").click({ timeout: 3000 }).then(() => true).catch(() => false)
  if (!clicked) console.log("   (按不到 #geoDemoBtn —— 舊版沒有這顆鈕)")
  await sleep(600)
  const b = await snap(page)
  check("F2 按下去真的進到測試模式:面板關、走路鈕出現、等待框與出口鈕都收起來",
    !b.intro && b.walkShown && !b.geoShown && !b.outShown)

  /* ★ 這一項才是「加一顆鈕」真正會咬人的地方:watchPosition 還在跑,
       stub 設定第 20 秒才回一筆 fix。沒 clearWatch 的話 beginPlay 會把人瞬移到真實座標
       (畫面上的證據=accChip 冒出「±12m」)。 */
  await sleep(20500)
  const c = await snap(page)
  check("F3 ★20 秒後晚到的 GPS fix 不會把客廳玩家瞬移走(切模式前有 clearWatch)",
    !c.intro && !c.accShown && c.acc !== "12", `accChip ${c.accShown ? "冒出來了 ±" + c.acc + "m" : "維持隱藏 🟢"}`)
  check("F4 無 pageerror", errs.length === 0, errs.slice(0, 2).join(" | "))
  await page.close()
}

await browser.close()
const bad = results.filter((r) => !r.ok)
console.log(`\n${bad.length === 0 ? "🟢 PASS" : "🔴 FAIL"} — ${results.length - bad.length}/${results.length} 項通過`)
process.exit(bad.length === 0 ? 0 : 1)
