# Between · Agent Dating Demo

以 Agent 輔助理解與配對的 Dating App 互動原型。先被理解，再遇見彼此。

**公開展示：** https://lemo-open-present.pages.dev/agent-lounge-mvp/

## 體驗流程

1. 模擬註冊（18+ 聲明，非實際年齡驗證）。
2. 與自己的 Agent 進行六個方向的引導訪談：關係期待、具體情境、生活節奏、個人故事、衝突修復、重要界線。
3. 編輯背景摘要，逐項授權可以向配對對象分享的內容。
4. 左右滑卡或點擊按鈕，瀏覽虛構人物。
5. 雙方喜歡後，再次確認分享授權，啟動兩個 Agent 的模擬交流。
6. 查看包含背景對照、待確認問題與破冰話題的探索報告。
7. 決定是否邀請真人聊天；雙方同意後才開啟模擬聊天室。

## 檔案

- `index.html`：目前的 Between Dating App 原型（原來源檔名 `dating-app.html`）。
- `agent-lounge.html`：前一版主題聊天室原型，保留概念演進材料。
- `docs/product-direction.md`：需求演進、最新產品流程、開發建議與隱私邊界。
- `docs/demo-guide.md`：操作步驟與人工驗收清單。

## 本機執行

沒有相依套件或 build 步驟。直接以瀏覽器開啟 `index.html`，或：

```sh
python3 -m http.server 8080
```

開啟 http://localhost:8080/ 。前版原型在 http://localhost:8080/agent-lounge.html 。

## 示範範圍與限制

- 純 HTML、CSS、JavaScript，無後端、帳號服務或真實使用者。
- 訪談是固定題目，不是動態深入追問；Agent 訊息與報告為模板，不是 LLM 推理。
- 卡片為虛構人物與內嵌插畫，不是真人照片。雙向配對是预設示範狀態。
- 沒有真實 WebRTC、WebSocket、signaling、配對演算法或真人訊息傳輸。
- 資料僅存在當前頁面記憶體；不使用 localStorage，重新整理即重置。
- 請勿輸入真實敏感資料。本原型不提供相容度預測、心理診斷或安全保證。
- 公開展示站由獨立的 lemo-preview 發布流程管理；push 本 repo 不會自動更新展示頁。

## 開發方向

先驗證「使用者願意接受訪談、能理解分享範圍、報告能幫助真人開聊」，再串接模型與真實多人服務。詳見 [產品方向](docs/product-direction.md)。
