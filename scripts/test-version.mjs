/* 🏷 版號一致性測試(純 Node,不開瀏覽器)— 2026-11-13
 *
 * 由來:同一個畫面出現兩個版號 —— 選單底下寫 v32,右下角徽章向 SW 問到的是 v41。
 *   兩份各自手寫、各自遞增,沒有任何東西擋它們分家。
 * 規則(1113 起):畫面版號 = sw.js 的快取版號。改版時三處一起改:
 *   ① sw.js            const CACHE = 'sheepquest-vN'
 *   ② index.html       <summary>版本 vN(YYYY-MM-DD)· 更新紀錄</summary>
 *   ③ index.html       #verTag 裡第一個 vN(更新紀錄最上面那一條)
 *   三個 N 不一樣 ⇒ exit 1;summary 與第一條的日期要是真的日期、而且兩邊一樣。
 *
 * 跑法:node scripts/test-version.mjs
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const html = readFileSync(join(root, "index.html"), "utf8")
const sw = readFileSync(join(root, "sw.js"), "utf8")

let fail = 0
const ok = (cond, msg) => { console.log((cond ? "  🟢 " : "  🔴 ") + msg); if (!cond) fail++ }

// ① SW 快取名(艦隊巡檢工具也讀這個格式,不要改命名)
const swM = /const\s+CACHE\s*=\s*['"]sheepquest-v(\d+)['"]/.exec(sw)
ok(!!swM, "sw.js 找得到 const CACHE = 'sheepquest-vN'" + (swM ? `(v${swM[1]})` : ""))

// ② 頁尾那一列 summary
const sumM = /<details class="ver-fold">\s*<summary>([^<]*)<\/summary>/.exec(html)
const sumText = sumM ? sumM[1].trim() : ""
// 括號半形全形都收(本站慣例是半形)
const sumV = /^版本 v(\d+)\s*[(（](\d{4}-\d{2}-\d{2})[)）]\s*· 更新紀錄$/.exec(sumText)
ok(!!sumV, `summary 長成「版本 vN(YYYY-MM-DD)· 更新紀錄」:「${sumText || "(找不到)"}」`)

// ③ 更新紀錄(#verTag)第一個 vN
const tagStart = html.indexOf('id="verTag"')
const tagEnd = tagStart >= 0 ? html.indexOf("</details>", tagStart) : -1
const tag = tagStart >= 0 && tagEnd > tagStart ? html.slice(tagStart, tagEnd) : ""
ok(!!tag, "找得到 #verTag 更新紀錄區塊")
const firstM = /v(\d+)\s*[(（](\d{4}-\d{2}-\d{2})[)）]/.exec(tag)
ok(!!firstM, "更新紀錄第一條是「vN(YYYY-MM-DD)」" + (firstM ? `(v${firstM[1]} ${firstM[2]})` : ""))

// 三者一致
if (swM && sumV && firstM) {
  const [a, b, c] = [swM[1], sumV[1], firstM[1]]
  ok(a === b && b === c, `三處版號一致:sw.js v${a} / summary v${b} / 更新紀錄第一條 v${c}`)
  ok(sumV[2] === firstM[2], `summary 與第一條日期相同:${sumV[2]} / ${firstM[2]}`)
}

// 日期要是真日期(不是 2026-13-45 這種)
function realDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}
if (sumV) ok(realDate(sumV[2]), `summary 的日期 ${sumV[2]} 是真的日期`)
if (firstM) ok(realDate(firstM[2]), `更新紀錄第一條的日期 ${firstM[2]} 是真的日期`)

// 畫面上不該再手寫第二份版號(舊的 v32 那種);徽章是向 SW 問的,不寫死數字
const badge = /id="appVerBadge"[^>]*>([^<]*)</.exec(html)
ok(!badge || !/v\d+/.test(badge[1]), "右下角徽章沒有寫死版號(向 SW 問)")

console.log(fail ? `\n🔴 版號不一致或格式不對(${fail} 項)` : "\n🟢 版號一致")
process.exitCode = fail ? 1 : 0
