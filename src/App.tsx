import { createSignal, For, Match, Switch } from 'solid-js';
import { MAX_SENT_TURNS_PER_AGENT } from './shared/constants';
import type { AppStage } from './shared/types';
import { getOrCreateClientId } from './features/onboarding/identity';
import LobbyConnection from './features/lobby/LobbyConnection';
import ProfilePreview from './features/profile/ProfilePreview';
import ConversationSurface from './features/exchange/ConversationSurface';
import SummaryPreview from './features/exchange/SummaryPreview';
import ConnectionPreview from './features/rtc/ConnectionPreview';

const stages: Array<{ id: AppStage; label: string; title: string; description: string; eyebrow: string }> = [
  { id: 'connect', label: '連接', title: '讓你的想法，\n遇見另一種可能。', description: '先讓 Agent 理解你的好奇與期待，\n再一起開啟值得開始的對話。', eyebrow: 'LESS GUESSING. MORE CONNECTION.' },
  { id: 'interview', label: '訪談', title: '先不急著遇見。\n聊聊真正的想法。', description: '你期待什麼樣的交流？最近在探索什麼？\n私人訪談只留在你的本機 Agent。', eyebrow: '01 / A SPACE FOR YOUR IDEAS' },
  { id: 'publish', label: '名片', title: '你的故事，\n由你決定分享多少。', description: '整理想讓對方知道的話題與期待。\n只有你確認公開的名片，才會進入 Lobby。', eyebrow: '02 / YOUR AGENT, IN A FEW WORDS' },
  { id: 'lobby', label: 'Lobby', title: '留一點空間，\n給新的觀點。', description: '準備好後，Agent 會在 Lobby 等待交流夥伴。\n每一次交流，都從雙方的同意開始。', eyebrow: '03 / OPEN TO A CONVERSATION' },
  { id: 'match-proposal', label: '邀請', title: '一個新的起點。\n要開始聊聊嗎？', description: '先看看對方願意分享的名片。\n雙方都接受邀請後，才會開始連線。', eyebrow: '04 / A POSSIBLE CONNECTION' },
  { id: 'connecting', label: '連線', title: '為彼此的想法，\n搭起一座橋。', description: 'Agent 交流將使用點對點通道。\n每次交流都開啟獨立工作階段。', eyebrow: '05 / MAKING A CONNECTION' },
  { id: 'exchange', label: '交流', title: '讓 Agent 先聊，\n讓想法慢慢展開。', description: '兩個 Agent 輪流交換完整的想法。\n你可以看見對話，也可以提早結束。', eyebrow: '06 / IDEAS MEET IDEAS' },
  { id: 'summary', label: '摘要', title: '聊過之後，\n帶走新的可能。', description: '回看對方 Agent 分享的交流摘要。\n下一步，由你自己決定。', eyebrow: '07 / SOMETHING TO KEEP' },
];

export default function App() {
  const [stage, setStage] = createSignal<AppStage>('connect');
  let clientId = '';
  let identityError = '';
  try { clientId = getOrCreateClientId(); }
  catch { identityError = '無法使用本機儲存空間，請允許此網站儲存資料後重新整理。'; }
  const index = () => stages.findIndex(item => item.id === stage());
  const current = () => stages[index()]!;

  return <>
    <header><a class="logo" href="/" aria-label="Agent Between 首頁">between<span> •</span></a><span class="pill">Agent to Agent, with understanding.</span></header>
    <main>
      <nav class="steps" aria-label="流程預覽"><For each={stages}>{(item, i) => <button classList={{ step: true, active: stage() === item.id }} aria-current={stage() === item.id ? 'step' : undefined} onClick={() => setStage(item.id)}><span>{String(i() + 1).padStart(2, '0')}</span> {item.label}</button>}</For></nav>
      <div class="preview-notice">應用骨架預覽 · 訪談、配對與 Agent 交流將在後續階段啟用。</div>
      <section class="grid" aria-label={current().label}>
        <div class="intro"><span class="eyebrow">{current().eyebrow}</span><h1>{current().title}</h1><p class="description muted">{current().description}</p>
          <div class="quote">Agent 是理解與交流的夥伴，<br />分享的邊界，始終由你決定。</div>
          <div class="tags"><span>私人訪談留在本機</span><span>交流前，雙方先同意</span></div>
          <div class="actions"><button class="primary" onClick={() => setStage(stages[(index() + 1) % stages.length]!.id)}>{stage() === 'connect' ? '預覽交流流程 →' : stage() === 'summary' ? '回到起點 →' : '預覽下一階段 →'}</button>{index() > 0 && <button class="quiet" onClick={() => setStage(stages[index() - 1]!.id)}>上一步</button>}</div>
        </div>
        <Switch>
          <Match when={stage() === 'connect'}><div class="panel"><span class="eyebrow">YOUR CONNECTION STARTS HERE</span><h2>從你的 Agent 開始</h2><p class="muted">使用本機 Pedelec，讓 Agent 依照你的設定理解與交流。</p><div class="readiness"><span class="status-dot" />Pedelec 尚未接入</div><button class="primary full" disabled>連接 Pedelec</button><p class="note">目前可預覽各階段。實際連接與授權會在下一階段完成。</p><div class="finding"><b>不需要建立帳號</b><p class="small">{identityError || '此瀏覽器的識別碼會保留在本機，重新整理後沿用。'}</p></div></div></Match>
          <Match when={stage() === 'interview'}><ConversationSurface interview /></Match>
          <Match when={stage() === 'publish' || stage() === 'match-proposal'}><div><ProfilePreview /><div class="actions centered"><button disabled class="primary">{stage() === 'publish' ? '確認並公開名片' : '接受邀請'}</button><button disabled>{stage() === 'publish' ? '編輯名片' : '暫時略過'}</button></div><p class="note center">{stage() === 'publish' ? '名片編輯與發佈尚未啟用' : '邀請預覽 · 尚未收到真實配對'}</p></div></Match>
          <Match when={stage() === 'lobby'}><div class="panel"><span class="eyebrow">THE AGENT LOBBY</span><h2>等待一段值得開始的對話</h2><p class="muted">目前可確認 Lobby 的連線狀態。自動配對與邀請將在後續階段啟用。</p><LobbyConnection clientId={clientId} /></div></Match>
          <Match when={stage() === 'connecting'}><ConnectionPreview /></Match>
          <Match when={stage() === 'exchange'}><div><ConversationSurface /><p class="note center">每個 Agent 最多送出 {MAX_SENT_TURNS_PER_AGENT} 則完整訊息，再進入摘要。</p></div></Match>
          <Match when={stage() === 'summary'}><SummaryPreview /></Match>
        </Switch>
      </section>
      <footer><span>一段對話，從願意理解開始。</span><span>Agent Between · Phase 1</span></footer>
    </main>
  </>;
}
