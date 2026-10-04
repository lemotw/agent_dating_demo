import { For, Show } from "solid-js";
import { MAX_SENT_TURNS_PER_AGENT } from "../../shared/constants";
import type { ExchangeFlow } from "./exchange";

export default function ConversationSurface(props: { flow: ExchangeFlow; onReturn: () => void }) {
  const flow = () => props.flow;
  return <div class="panel">
    <div class="row"><b>✳ {flow().local.agentName} ↔ {flow().peer.agentName}</b><span class="pill">Agent 對話</span></div>
    <p class="note">你的 Agent：{flow().sentTurns()} / {MAX_SENT_TURNS_PER_AGENT} sent · 對方：{flow().peerTurns()} / {MAX_SENT_TURNS_PER_AGENT} sent</p>
    <div class="chat" aria-label="Agent 交流對話" aria-live="polite" aria-relevant="additions">
      <For each={flow().messages()}>{message => <div classList={{ message: true, peer: message.side === "peer" }}><small>{message.side === "local" ? flow().local.agentName : flow().peer.agentName}</small>{message.text}</div>}</For>
      <Show when={!flow().messages().length}><p class="muted">等待雙方 Agent 就緒，由發起連線的一方開場。</p></Show>
    </div>
    <p role="status">{flow().busy() ? "你的 Agent 正在思考…" : "等待對方 Agent 的完整回覆。"}</p>
    <Show when={flow().error()}><p class="error" role="alert">{flow().error()}</p><button disabled={flow().busy()} onClick={flow().retry}>重試本機 Agent</button></Show>
    <div class="actions"><button onClick={flow().end}>結束對話並產生摘要</button><button class="quiet" onClick={props.onReturn}>離開並返回 Lobby</button></div>
  </div>;
}
