import { For, Show } from "solid-js";
import type { AppStage, LobbyAgentProfile } from "../../shared/types";
import { createLobbyConnection } from "./lobby";
import ConnectionPreview from "../rtc/ConnectionPreview";
import ConversationSurface from "../exchange/ConversationSurface";
import SummaryPreview from "../exchange/SummaryPreview";

export default function LobbyConnection(props: { profile: LobbyAgentProfile; stage: AppStage; onStage: (stage: AppStage) => void }) {
  const lobby = createLobbyConnection(() => props.profile, props.onStage);
  const label = () => ({ publishing: "正在發佈 Agent 名片…", reconnecting: "Lobby 連線中斷，正在重連…", waiting: "已在線上 Lobby，等待交流夥伴。", proposal: "收到交流邀請，請決定是否接受。", "peer-decision": "你已接受邀請，等待對方決定。", connecting: "雙方已同意，正在建立點對點連線。", paused: "這次連線已結束，返回 Lobby 後可繼續配對。", disconnected: "Lobby 已離線" })[lobby.status()];
  return (
    <div>
      <Show when={lobby.exchange() && ["exchange", "summary"].includes(props.stage)} fallback={<>
      <Show when={lobby.peerConnection()} fallback={<>
      <Show when={lobby.proposal()} fallback={
        <div class="panel">
          <span class="eyebrow">THE AGENT LOBBY</span><h2>等待一段值得開始的對話</h2>
          <p class="muted">依最近加入時間尋找在線上的交流夥伴。雙方同意後才開始連線。</p>
          <div class="finding"><b>{props.profile.agentName} 的公開名片</b><p>{props.profile.publicSummary}</p><div class="tags"><For each={props.profile.topics}>{topic => <span>{topic}</span>}</For></div></div>
        </div>
      }>{match => <article class="profile-card">
        <div class="profile-art" aria-hidden="true"><span>✳</span><span>↗</span></div>
        <div class="profile-content">
          <span class="eyebrow">A POSSIBLE CONNECTION</span>
          <h2>{match().peer.agentName}</h2><p class="small">代表 {match().peer.displayName}</p>
          <p>{match().peer.publicSummary}</p>
          <div class="tags"><For each={match().peer.topics}>{topic => <span>{topic}</span>}</For></div>
          <Show when={match().peer.lookingFor.length}><h3>期待的交流</h3><For each={match().peer.lookingFor}>{item => <p>{item}</p>}</For></Show>
          <For each={match().peer.sections}>{section => <div class="finding"><b>{section.label}</b><p>{section.text}</p></div>}</For>
          <Show when={lobby.peerAccepted() && lobby.status() !== "connecting"}><p class="banner">對方已接受，等你決定。</p></Show>
          <Show when={lobby.status() !== "connecting"}>
            <div class="actions">
              <button class="primary" disabled={lobby.decisionPending() || lobby.status() === "peer-decision"} onClick={() => lobby.decide(true)}>{lobby.status() === "peer-decision" ? "已接受 · 等待對方" : "接受邀請"}</button>
              <button disabled={lobby.decisionPending()} onClick={() => lobby.decide(false)}>婉拒邀請</button>
            </div>
          </Show>
        </div>
      </article>}</Show>
      </>}><ConnectionPreview state={lobby.peerState()} detail={lobby.peerDetail()} onReturn={lobby.returnToLobby} /></Show>
      <Show when={lobby.exchange() && props.stage === "connecting"}>{_shown => <div class="connection-check"><p role="status">{lobby.exchange()!.ready() ? "本機 Agent 已就緒，等待對方 Agent。" : "正在建立獨立的交流 Agent…"}</p><Show when={lobby.exchange()!.error()}><p class="error" role="alert">{lobby.exchange()!.error()}</p><button onClick={lobby.exchange()!.retry}>重試建立 Agent</button></Show><button onClick={lobby.exchange()!.end}>結束並進入摘要</button></div>}</Show>
      </>}>{_shown => <Show when={lobby.exchange()}>{flow => <Show when={props.stage === "summary"} fallback={<ConversationSurface flow={flow()} onReturn={lobby.returnToLobby} />}><SummaryPreview flow={flow()} onReturn={lobby.returnToLobby} /></Show>}</Show>}</Show>
      <div class="connection-check">
        <Show when={!lobby.peerConnection() || lobby.status() === "disconnected" || lobby.status() === "paused"}><p role="status" aria-live="polite">{label()}</p></Show>
        <Show when={lobby.notice()}><p class="banner" role="status">{lobby.notice()}</p></Show>
        <Show when={lobby.status() === "disconnected" && !lobby.peerConnection()}><button onClick={lobby.connect}>重新連線並加入 Lobby</button></Show>
        <p class="note">只發佈你核准的公開名片；私人訪談留在本機。離開此流程會關閉 Lobby 連線。</p>
      </div>
    </div>
  );
}
