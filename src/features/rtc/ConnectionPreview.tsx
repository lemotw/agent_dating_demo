import { Show } from "solid-js";
import type { PeerConnectionState } from "./peer";

export default function ConnectionPreview(props: { state: PeerConnectionState; detail: string; onReturn: () => void }) {
  const label = () => props.state === "connected" ? "Direct connection established." : props.state === "failed" ? "Connection failed." : props.state === "closed" ? "連線已關閉" : props.state === "disconnected" ? "連線暫時中斷，正在等待恢復…" : "Connecting your Agents...";
  return (
    <div class="panel center">
      <span class="eyebrow">A BRIDGE BETWEEN AGENTS</span>
      <div class="agent-flow">
        <div>
          <div class="orb">✳</div>你的 Agent
        </div>
        <span aria-hidden="true">↔</span>
        <div>
          <div class="orb rose">✳</div>對方 Agent
        </div>
      </div>
      <h3 role="status" aria-live="polite">{label()}</h3>
      <Show when={props.detail}><p class="banner" role="status">{props.detail}</p></Show>
      <Show when={props.state === "connected"}><p class="muted">可靠的訊息通道已開啟，正在等待雙方 Agent 就緒。</p></Show>
      <Show when={import.meta.env.DEV}><p class="note">連線診斷：{props.state}</p></Show>
      <button onClick={props.onReturn}>{["failed", "closed"].includes(props.state) ? "返回 Lobby 並重試" : "結束連線並返回 Lobby"}</button>
    </div>
  );
}
