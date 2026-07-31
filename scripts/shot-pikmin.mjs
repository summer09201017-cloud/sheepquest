/* 📸 v14 截圖台:把「地點膠囊/指南針/地圖配色/詳情面板/明信片」各拍一張出來親眼看。
   由來:本系列反覆的教訓是「自動測試全綠、畫面卻是錯的」(0730 一次就抓到 4 個)。
   跑法:先 npx http-server -p 5199 -c-1 . ;URL=http://127.0.0.1:5199/ node scripts/shot-pikmin.mjs */
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const URL_ = process.env.URL || "http://127.0.0.1:5199/"
const OUT = process.env.OUT || "scripts/shots"
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const FAKE_PLACE = "測試河濱公園"

const GEO_STUB = `(() => {
  const P = { coords: { latitude: 25.033, longitude: 121.5654, accuracy: 9 }, timestamp: Date.now() };
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
    getCurrentPosition(ok) { setTimeout(() => ok(P), 60) },
    watchPosition(ok) { setTimeout(() => ok(P), 80); return 1 },
    clearWatch() {},
  }});
})()`

const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await page.route(/nominatim\.openstreetmap\.org/, (r) =>
  r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ name: FAKE_PLACE, category: "leisure", type: "park", address: { suburb: FAKE_PLACE } }) }))
await page.addInitScript(GEO_STUB)
await page.goto(URL_, { waitUntil: "domcontentloaded" })
await page.waitForSelector("#startBtn")
await page.locator("#agree").check()
await page.locator("#startBtn").click()
await page.waitForSelector("#map.leaflet-container", { timeout: 15000 })
await sleep(4000)                                     // 等真實圖磚進來,配色才看得出來

await page.evaluate(() => {
  const e = new Event("deviceorientation")
  Object.defineProperty(e, "alpha", { value: 35 })
  dispatchEvent(e)
})
await sleep(400)
await page.screenshot({ path: `${OUT}/v14-1-map.png` })
console.log("① 地圖 + 地點膠囊 + 指南針 →", `${OUT}/v14-1-map.png`)

await page.locator(".sheepMark").first().click()
await sleep(500)
await page.screenshot({ path: `${OUT}/v14-2-sheet.png` })
console.log("② 挑戰詳情面板 →", `${OUT}/v14-2-sheet.png`)
await page.locator("#shClose").click()

/* 明信片:走客廳模式抓一隻 */
await page.reload({ waitUntil: "domcontentloaded" })
await page.waitForSelector("#startBtn")
await page.locator("#agree").check()
await page.locator("#demoBtn").click()
await sleep(1200)
for (let i = 0; i < 40; i++) {
  await page.locator("#walkBtn").click()
  await sleep(150)
  if (await page.evaluate(() => getComputedStyle(document.getElementById("nearBar")).display !== "none")) break
}
await page.locator("#nearBar").click()
await sleep(1200)
for (let i = 0; i < 160; i++) {
  const tele = await page.evaluate(() => document.getElementById("meterBox").classList.contains("tele"))
  await page.locator(tele ? "#dodgeBtn" : "#ropeBtn").click({ timeout: 2000 }).catch(() => {})
  await sleep(110)
  if (await page.evaluate(() => document.getElementById("pcPanel").classList.contains("on"))) break
}
await sleep(600)
await page.screenshot({ path: `${OUT}/v14-3-postcard.png`, fullPage: true })
console.log("③ 明信片 →", `${OUT}/v14-3-postcard.png`)

await browser.close()
