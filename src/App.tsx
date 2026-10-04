import { createSignal, For, Match, Switch, Show, onMount } from "solid-js";
import type { AppStage, LocalAgentProfile } from "./shared/types";
import { createInterview, errorMessage } from "./features/onboarding/interview";
import InterviewPanel from "./features/onboarding/InterviewPanel";
import ProfileReview from "./features/profile/ProfileReview";
import { restoreProfile, toLobbyAgentProfile } from "./features/profile/profile";
import { getOrCreateClientId } from "./features/onboarding/identity";
import LobbyConnection from "./features/lobby/LobbyConnection";

const stages: Array<{
  id: AppStage;
  label: string;
  title: string;
  description: string;
  eyebrow: string;
}> = [
  {
    id: "connect",
    label: "連接",
    title: "讓你的想法，\n遇見另一種可能。",
    description: "先讓 Agent 理解你的好奇與期待，\n再一起開啟值得開始的對話。",
    eyebrow: "LESS GUESSING. MORE CONNECTION.",
  },
  {
    id: "interview",
    label: "訪談",
    title: "先不急著遇見。\n聊聊真正的想法。",
    description:
      "你期待什麼樣的交流？最近在探索什麼？\n私人訪談只留在你的本機 Agent。",
    eyebrow: "01 / A SPACE FOR YOUR IDEAS",
  },
  {
    id: "publish",
    label: "名片",
    title: "你的故事，\n由你決定分享多少。",
    description:
      "整理想讓對方知道的話題與期待。\n只有你確認公開的名片，才會進入 Lobby。",
    eyebrow: "02 / YOUR AGENT, IN A FEW WORDS",
  },
  {
    id: "lobby",
    label: "Lobby",
    title: "留一點空間，\n給新的觀點。",
    description:
      "準備好後，Agent 會在 Lobby 等待交流夥伴。\n每一次交流，都從雙方的同意開始。",
    eyebrow: "03 / OPEN TO A CONVERSATION",
  },
  {
    id: "match-proposal",
    label: "邀請",
    title: "一個新的起點。\n要開始聊聊嗎？",
    description: "先看看對方願意分享的名片。\n雙方都接受邀請後，才會開始連線。",
    eyebrow: "04 / A POSSIBLE CONNECTION",
  },
  {
    id: "connecting",
    label: "連線",
    title: "為彼此的想法，\n搭起一座橋。",
    description: "Agent 交流將使用點對點通道。\n每次交流都開啟獨立工作階段。",
    eyebrow: "05 / MAKING A CONNECTION",
  },
  {
    id: "exchange",
    label: "交流",
    title: "讓 Agent 先聊，\n讓想法慢慢展開。",
    description:
      "兩個 Agent 輪流交換完整的想法。\n你可以看見對話，也可以提早結束。",
    eyebrow: "06 / IDEAS MEET IDEAS",
  },
  {
    id: "summary",
    label: "摘要",
    title: "聊過之後，\n帶走新的可能。",
    description: "回看對方 Agent 分享的交流摘要。\n下一步，由你自己決定。",
    eyebrow: "07 / SOMETHING TO KEEP",
  },
];

export default function App() {
  const [stage, setStage] = createSignal<AppStage>("connect");
  let clientId = "";
  let identityError = "";
  try {
    clientId = getOrCreateClientId();
  } catch {
    identityError = "無法使用本機儲存空間，請允許此網站儲存資料後重新整理。";
  }
  const flow = createInterview();
  const [profile, setProfile] = createSignal<LocalAgentProfile>();
  const [flowError, setFlowError] = createSignal("");
  try { setProfile(restoreProfile(clientId) ?? undefined); }
  catch { identityError = "無法讀取本機名片，請允許此網站使用儲存空間後重新整理。"; }
  onMount(() => void flow.probe());
  const [reviewVersion, setReviewVersion] = createSignal(0);
  const readyToConnect = () => !!flow.availability()?.extension.available && !!flow.availability()?.desktop.available && !identityError;
  const readyForLobby = () => readyToConnect() && !!flow.availability()?.approval.approved && !flow.checking();
  const blockedReason = () => {
    const status = flow.availability();
    if (identityError) return identityError;
    if (!status) return "請檢查連線。使用支援擴充功能的桌面瀏覽器，安裝 Pedelec 擴充功能並啟動 Desktop。";
    if (!status.extension.available) return "未偵測到 Pedelec 擴充功能。請在桌面瀏覽器安裝、啟用擴充功能，再重新檢查。";
    if (!status.desktop.available) return "Pedelec Desktop 尚未連線。請啟動 Desktop 並確認本機預設 Agent 已設定，再重新檢查。";
    if (!status.approval.approved) return "此網站尚未獲准使用 Pedelec。按下「授權並開始訪談」，在擴充功能中核准此網站。";
    return "Pedelec 已就緒，訪談使用你的本機預設 Agent 設定。";
  };
  async function startInterview() {
    setFlowError("");
    if (readyToConnect() && await flow.start()) setStage("interview");
  }
  async function navigate(target: AppStage) {
    if (flow.busy()) return;
    setFlowError("");
    if (target === "interview" && !flow.active()) return;
    if (target === "publish" && !flow.candidate() && !profile()) return;
    if (target === "lobby" && (!profile() || !readyForLobby())) return;
    if (!["connect", "interview", "publish", "lobby"].includes(target)) return;
    if (target === "lobby" && ["lobby", "match-proposal", "connecting", "exchange", "summary"].includes(stage())) return;
    if (target !== "interview" && target !== "publish" && flow.active()) {
      try { await flow.end(); } catch (e) { setFlowError(`無法結束私人訪談：${errorMessage(e)}，請重試或重新整理。`); return; }
    }
    setStage(target);
  }
  const canNavigate = (target: AppStage) => !flow.busy() && (target === "connect" || (target === "interview" ? flow.active() : target === "publish" ? !!flow.candidate() || !!profile() : target === "lobby" ? !!profile() && readyForLobby() : false));
  const index = () => stages.findIndex((item) => item.id === stage());
  const current = () => stages[index()]!;

  return (
    <>
      <header>
        <a class="logo" href="/" aria-label="Agent Between 首頁">
          between<span> •</span>
        </a>
        <span class="pill">Agent to Agent, with understanding.</span>
      </header>
      <main>
        <nav class="steps" aria-label="交流流程">
          <For each={stages}>
            {(item, i) => (
              <button
                classList={{ step: true, active: stage() === item.id }}
                aria-current={stage() === item.id ? "step" : undefined}
                disabled={!canNavigate(item.id)}
                onClick={() => void navigate(item.id)}
              >
                <span>{String(i() + 1).padStart(2, "0")}</span> {item.label}
              </button>
            )}
          </For>
        </nav>
        <div class="preview-notice">
          本機 Agent 輪流交流，完整訊息與摘要透過點對點通道傳送。
        </div>
        <section class="grid" aria-label={current().label}>
          <div class="intro">
            <span class="eyebrow">{current().eyebrow}</span>
            <h1>{current().title}</h1>
            <p class="description muted">{current().description}</p>
            <div class="quote">
              Agent 是理解與交流的夥伴，
              <br />
              分享的邊界，始終由你決定。
            </div>
            <div class="tags">
              <span>私人訪談留在本機</span>
              <span>交流前，雙方先同意</span>
            </div>
            <div class="actions">

              <Show when={stage() !== "connect"}><button class="quiet" disabled={flow.busy()} onClick={() => void navigate("connect")}>回到連接頁</button></Show>
            </div>
            <Show when={flowError()}><p class="error" role="alert">{flowError()}</p></Show>
          </div>
          <Switch>
            <Match when={stage() === "connect"}>
              <div class="panel">
                <span class="eyebrow">YOUR CONNECTION STARTS HERE</span>
                <h2>從你的 Agent 開始</h2>
                <p class="muted">
                  使用本機 Pedelec，讓 Agent 依照你的設定理解與交流。
                </p>
                <div class="readiness">
                  <span classList={{ "status-dot": true, ready: flow.availability()?.available }} />
                  {flow.checking() ? "正在檢查 Pedelec…" : flow.availability()?.available ? "Pedelec 已就緒" : "Pedelec 尚未就緒"}
                </div>
                <p class="banner" role="status">{blockedReason()}</p>
                <div class="actions"><button class="primary" disabled={!readyToConnect() || flow.busy() || flow.checking()} onClick={() => void startInterview()}>{flow.busy() ? "正在建立私人訪談…" : flow.availability()?.approval.approved ? "開始／重新訪談 →" : "授權並開始訪談 →"}</button><button disabled={flow.checking() || flow.busy()} onClick={() => void flow.probe()}>重新檢查</button></div>
                <Show when={flow.error()}><p class="error" role="alert">{flow.error()}</p></Show>
                <Show when={profile()}>{saved => <div class="finding"><b>已還原 {saved().displayName} 的名片</b><p>{saved().publicSummary}</p><div class="actions"><button class="primary" disabled={!canNavigate("lobby")} onClick={() => void navigate("lobby")}>繼續前往 Lobby</button><button disabled={flow.busy()} onClick={() => { flow.candidate() && setReviewVersion(v => v + 1); void navigate("publish"); }}>編輯名片</button></div><p class="small">重新訪談會建立新的私人工作階段；儲存前仍保留既有名片。</p></div>}</Show>
                <div class="finding">
                  <b>不需要建立帳號</b>
                  <p class="small">
                    {identityError ||
                      "此瀏覽器的識別碼會保留在本機，重新整理後沿用。"}
                  </p>
                </div>
              </div>
            </Match>
            <Match when={stage() === "interview"}>
              <InterviewPanel flow={flow} onReview={() => { setReviewVersion(v => v + 1); setStage("publish"); }} />
            </Match>
            <Match when={stage() === "publish"}>
              <Show when={reviewVersion() + 1} keyed>{_reviewKey => <div><ProfileReview clientId={clientId} candidate={flow.candidate()} existing={profile()} busy={flow.busy()} onSave={async saved => { await flow.end(); setProfile(saved); await flow.probe(); if (readyForLobby()) setStage("lobby"); else { setFlowError("名片已儲存，請確認 Pedelec 已就緒並核准此網站後再進入 Lobby。"); setStage("connect"); } }} onRegenerate={flow.active() && flow.step() === 6 ? async () => { if (await flow.generate()) setReviewVersion(v => v + 1); } : undefined} /><Show when={flow.error()}><p class="error" role="alert">{flow.error()}</p></Show></div>}</Show>
            </Match>
            <Match when={["lobby", "match-proposal", "connecting", "exchange", "summary"].includes(stage())}>
              <Show when={profile()}>{saved => <LobbyConnection profile={toLobbyAgentProfile(saved())} stage={stage()} onStage={setStage} />}</Show>
            </Match>
          </Switch>
        </section>
        <footer>
          <span>一段對話，從願意理解開始。</span>
          <span>Agent Between · MVP</span>
        </footer>
      </main>
    </>
  );
}
