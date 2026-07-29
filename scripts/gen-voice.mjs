// gen-voice.mjs —— 把尋羊記要唸的經文用 edge-tts 預烤成人聲 mp3(曉臻)
//
// ★ 使用者鐵律(2026-07-30 第二次拍板,已立守門 #27 scripture-voice-guard):
//   ① 朗讀一律**預烤神經人聲**,不可用瀏覽器 Web Speech 機器聲;
//   ② 經文的**章節出處也要唸出來**,而且接在經文後面烤進**同一支 mp3**,不分兩段播。
//   出處寫成唸得順的中文數字(「路加福音十五章四到五節」),不要寫 15:4-5(會被唸成「十五比四減五」)。
//
// 這支跟其他 3D 專案的差別:尋羊記是**單檔 PWA、沒有 src/**,所以
//   · 檔名用「看得懂的 ref」而不是 FNV 雜湊 → index.html 裡的 VOICE 表直接用經文出處當鍵,對得起來、好維護;
//   · 產物放 ./voice/,並且要記得加進 sw.js 的 CORE 清單(離線也要有聲音)。
//
// 用法:node scripts/gen-voice.mjs(需網路;產物進 git,之後離線可玩)
//   累加式:已存在的 mp3 直接跳過,所以偶發的「Stream closed」重跑一兩次就補齊。
// 新增句子:加進下面 LINES 再重跑,然後把 key 補進 index.html 的 VOICE 表。
import { mkdirSync, existsSync, copyFileSync, rmSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

// msedge-tts 內部的非同步清理會在我們搬走檔案後再 unlink 一次 → 吞掉這個特定錯誤,別讓它炸掉整批
process.on('uncaughtException', (e) => {
  if (e && e.code === 'ENOENT' && e.syscall === 'unlink') return
  console.error(e)
  process.exit(1)
})

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'voice')
mkdirSync(OUT, { recursive: true })

const VOICE_SCRIPTURE = 'zh-TW-HsiaoChenNeural'   // 曉臻(柔和女聲,HFPC 經文慣例)

/* file = 產出的檔名(不含 .mp3);say = 真正要唸的內容(經文 + 出處,一支到底)
   ★ 經文都用 cuv MCP 逐句查驗過和合本原文(2026-07-30);出處用中文數字寫法。 */
const LINES = [
  { file: 'luke15-4-5',
    say: '你們中間誰有一百隻羊失去一隻,不把這九十九隻撇在曠野、去找那失去的羊,直到找著呢?找著了,就歡歡喜喜地扛在肩上,回到家裡。路加福音十五章四到五節。' },
  { file: 'luke15-5',
    say: '找著了,就歡歡喜喜地扛在肩上,回到家裡。路加福音十五章五節。' },
  { file: 'luke15-6',
    say: '我失去的羊已經找著了,你們和我一同歡喜吧!路加福音十五章六節。一百隻,一隻也不少。' },
  { file: '1sam17-37',
    say: '耶和華救我脫離獅子和熊的爪。撒母耳記上十七章三十七節。不是靠你的力氣,是神與你同在。' },
  { file: 'voice-on',
    say: '好,我會把經文唸出來。' },
]

let made = 0, skipped = 0, failed = 0
async function bake({ file, say }) {
  const fp = join(OUT, `${file}.mp3`)
  if (existsSync(fp)) { skipped++; console.log('·', file, '(已有,跳過)'); return }
  const tmpDir = join(OUT, `_tmp_${file}`)
  try {
    const tts = new MsEdgeTTS()
    await tts.setMetadata(VOICE_SCRIPTURE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    mkdirSync(tmpDir, { recursive: true })
    const { audioFilePath } = await tts.toFile(tmpDir, say)
    copyFileSync(audioFilePath, fp)          // copy 不 rename:留原檔給 lib 自己清,避免它 unlink 撲空
    try { tts.close && tts.close() } catch { /* socket 已關 */ }
    made++
    console.log('✓', file, `(${statSync(fp).size} bytes)`, say.slice(0, 24) + '…')
  } catch (err) {
    failed++
    console.error('✗', file, String(err).slice(0, 140))
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* noop */ }
  }
}

for (const l of LINES) await bake(l)

const mp3s = readdirSync(OUT).filter((f) => f.endsWith('.mp3'))
console.log(`\ndone: made ${made}, skipped ${skipped}, failed ${failed}, total ${mp3s.length} mp3`)
console.log('★ 別忘了:新增 mp3 要一併加進 sw.js 的 CORE 清單(離線才有聲音)+ bump CACHE 版本。')
process.exit(failed ? 1 : 0)               // 明確收尾(lib 的 WebSocket 會讓 process 掛著)
