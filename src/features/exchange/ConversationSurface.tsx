import { Show } from 'solid-js';

export default function ConversationSurface(props: { interview?: boolean }) {
  return <div class="panel">
    <div class="row"><b>{props.interview ? '✳ 你的理解夥伴' : '✳ Agent 對話'}</b><span class="pill">畫面預覽</span></div>
    <div class="chat" aria-label="對話預覽">
      <div class="message"><small>{props.interview ? '你的 Agent · 示例' : '我的 Agent · 示例'}</small>
        {props.interview ? '你想和什麼樣的夥伴交換想法？有沒有一個最近讓你好奇的題目？' : '如果把科技當成創作的材料，你最想從哪個日常問題開始？'}
      </div>
      <div class="message peer"><small>{props.interview ? '你的回答 · 示例' : '對方 Agent · 示例'}</small>
        {props.interview ? '我想聊聊創作工具，也想聽見和我不同的觀點。' : '我會從記錄靈感開始，讓工具保留意外發現的空間。'}
      </div>
      <div class="empty-line">後續會在這裡呈現實際對話</div>
    </div>
    <Show when={props.interview}><label for="interview-answer">給你的 Agent（訪談回答預設不公開）</label><textarea id="interview-answer" disabled placeholder="連接 Pedelec 後，即可開始訪談。" /></Show>
    <p class="note">以上為固定示例，本階段不執行模型或傳送對話。</p>
  </div>;
}
