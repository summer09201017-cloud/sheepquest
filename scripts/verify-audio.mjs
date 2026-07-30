import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: process.env.CHROME_EXE, args: ["--autoplay-policy=no-user-gesture-required"] })
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const errs = []
p.on("pageerror", e => errs.push("pageerror: " + e.message))
p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text()) })
await p.goto(process.env.URL, { waitUntil: "domcontentloaded" })
await p.waitForFunction(() => !!window.__sq3d, null, { timeout: 20000 })
// 勾守則 → 進測試模式(這是使用者手勢,音訊應該被解鎖)
await p.evaluate(() => { document.getElementById("agree").checked = true; document.getElementById("agree").dispatchEvent(new Event("change")) })
await p.locator("#demoBtn").click()
await new Promise(r => setTimeout(r, 1200))
const st = await p.evaluate(() => ({
  unlocked: SFX._unlocked, ctxState: SFX.ctx && SFX.ctx.state, track: SFX._track, want: SFX._want,
  musicGain: SFX.music && +SFX.music.gain.value.toFixed(3), sfxGain: SFX.sfx && +SFX.sfx.gain.value.toFixed(2),
  bgmBtn: document.getElementById("bgmBtn").textContent.trim(), muted: SFX.muted,
}))
console.log("進場後:", JSON.stringify(st))
// 逐一觸發六個音效,確認都不炸
const fired = await p.evaluate(() => {
  const names = ["hitBeast", "whiff", "bitten", "dodge", "beastFlee", "soothe", "home"]
  const ok = []
  for (const n of names) { try { SFX[n](); ok.push(n) } catch (e) { ok.push(n + "✗" + e.message) } }
  return ok
})
console.log("音效觸發:", fired.join(", "))
// 切戰鬥曲 → 再切回走路曲
const sw = await p.evaluate(() => { SFX.startMusic("fight"); const a = SFX._track; SFX.startMusic("walk"); return { fight: a, back: SFX._track } })
console.log("換曲:", JSON.stringify(sw))
// 靜音鈕:關掉要停音樂、按鈕文字要變
const mute = await p.evaluate(() => { SFX.toggle(); const a = { muted: SFX.muted, track: SFX._track, label: document.getElementById("bgmBtn").textContent.trim() }; SFX.toggle(); return { off: a, on: { muted: SFX.muted, track: SFX._track, label: document.getElementById("bgmBtn").textContent.trim() } } })
console.log("靜音鈕:", JSON.stringify(mute))
console.log("\npageerrors/console errors:", errs.length)
for (const e of errs.slice(0, 5)) console.log("  ✗", e.slice(0, 180))
await b.close()
process.exit(errs.length === 0 ? 0 : 1)
