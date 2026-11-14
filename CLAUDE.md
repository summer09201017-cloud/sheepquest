# 尋羊記(sheepquest)— repo 守則

路加福音 15 定位抓寶 + 從野獸口中搶救。單檔 `index.html` + `sw.js`,無建置、刻意零 node_modules。
詳細的前因後果與每版踩過的坑在 `讀我.txt`(交接正本);這份只放「現況 / 部署 / 測試」。

## 現況

- **2026-11-14 v43**(畫面號 = SW 號 `sheepquest-v43`)
  11/13 的按鈕放大與重排已退回改前(頂列回一排、精度膠囊回第一排、按鈕/膠囊/視角鈕回原尺寸與位置、頁尾版本列回一般一行);
  字的大小調整留著:經文 19px、開場畫面說明 18px。也退回改前的字:頂列、羊名、明信片說明、視角鈕、探險鈕、開場以外的 .hint(詳情卡、戰鬥、羊圈、足跡、明信片匣)。
  ⚠ **這一站以後不要主動放大按鈕或改排法**(使用者 2026-11-14 指示;要做先問)。`scripts/verify-topbar.mjs` 會擋「頂列比改前多一排/加高」。
- **2026-11-13(1113-0657-額度排程與熱門站審查-家裡)v42**:版號合一(畫面 summary、更新紀錄第一條、sw.js `sheepquest-v42` 三處同號,
  以後畫面號 = SW 號);長輩友善(說明 18px、經文 19px、按鈕 48px、頂列改兩排字 14px/鈕 ≥44px、羊名與明信片說明 16px);
  地圖詳情卡改用 `CATCH_M`(原本寫死 25);刪地標照片先確認;路 15:10、書 1:9 補「　神」;`.assetsignore` 擋 `.claude/`;
  新增兩支純 Node 測試。
  **沒動**:撒上 17:34-35「他/牠」與創 28:15、書 1:9「那裡/哪裡」(待使用者或牧者裁定);pedometer.js 的彌 6:8、創 5:24
  也缺「　神」空格(不在本輪清單,沒改);語音稿與 mp3 沒動;戰鬥、定位錯誤提示、統計打點沒動。

## 部署(Cloudflare Workers,不是 Pages)

```
npx wrangler deploy --name hfpc-sheepquest --assets . --compatibility-date 2026-07-30
```

- 線上:https://hfpc-sheepquest.summer09201017.workers.dev
- 上傳排除靠 `.assetsignore`(.git、.wrangler、scripts、.claude、讀我.txt、CLAUDE.md…),新增不該上線的檔要加進去。
- zero-pii-guard 會把 `leaflet@1.9.4`、`three@0.160.0` 誤判成 email:先不帶旗標跑一次、確認紅燈仍只有這兩個,才單次手打 `PII_OK=1`。
  不要把旗標寫進文件或腳本(理由見 `讀我.txt`)。
- 驗收抓根路徑 `/`(抓 `/index.html` 會 307 拿到 0 bytes);`?bust=` 對 Workers 靜態資源沒用,要帶 `Cache-Control: no-cache` 標頭。

## 測試

改版前後都跑(純 Node,不開瀏覽器):

```
node scripts/test-version.mjs   # 版號:sw.js 的 sheepquest-vN、summary、#verTag 第一條三處同號,日期是真日期
node scripts/test-verses.mjs    # 經文與語音稿:逐字對釘死的期望字串(雙向:改了、刪了、多了都紅)
```

- 改版:三處一起改(sw.js `CACHE`、`<summary>版本 vN(YYYY-MM-DD)· 更新紀錄</summary>`、`#verTag` 最上面加一條白話)。
- 改經文:先 `mcp__cuv__lookup` 查和合本 → 改原始檔 → 改 `test-verses.mjs` 的期望字串;改語音稿要重烤 mp3(`scripts/gen-voice.mjs`)。

會開瀏覽器的(記憶體吃緊時一次只跑一支):

```
node scripts/verify-topbar.mjs  # 頂列一排:360/390/412 直向排得下、只有一排、頂部底 ≤90px(不可比改前高)、toast 不蓋
```

- 已知邊角(改前就有,沒修):羊數 100/100 且定位誤差 3 位數同時出現時,360/390 寬第一排多 5~7px;
  橫向 740×360 時「🔊 朗讀」與地名膠囊上下疊 4px、有指南針的手機上指南針蓋住「斜視角」鈕上緣 6px。要修得動排法,先問使用者。

verify-topbar 自己起本機伺服器,playwright 借 `~/Downloads/hfpc-git/sheepflock3d` 或 `Desktop/AI/hfpc-speak` 的 node_modules。
其他 `scripts/verify-*.mjs` 多半寫死 `http://127.0.0.1:5199/`(要先 `npx http-server -p 5199 -c-1 .`),
有幾支 playwright 路徑寫死 sheepflock3d(家裡機沒有那個資料夾,要跑先改路徑)。
