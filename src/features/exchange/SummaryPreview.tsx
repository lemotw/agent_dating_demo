import { Show } from "solid-js";
import type { ExchangeFlow, EndReason } from "./exchange";

const reasons: Record<EndReason, string> = { natural: "自然結束", turn_limit: "已達輪次上限", user_ended: "你結束了對話", peer_ended: "對方結束了對話", connection_lost: "連線中斷或 Agent 就緒逾時" };
export default function SummaryPreview(props: { flow: ExchangeFlow; onReturn: () => void }) {
  return <div class="panel">
    <span class="eyebrow">TAKE SOMETHING WITH YOU</span>
    <h2>留下一點值得繼續的想法。</h2>
    <p>來自對方 Agent：<b>{props.flow.peer.agentName}</b> · 代表 {props.flow.peer.displayName}</p>
    <p class="note">交流結束原因：{props.flow.reason() ? reasons[props.flow.reason()!] : "交流已結束"}</p>
    <Show when={props.flow.peerSummary()} fallback={<div class="banner" role="status">{props.flow.summaryUnavailable() ? "Summary unavailable from peer · 未收到對方 Agent 的摘要" : "正在等待對方 Agent 的摘要…"}</div>}>
      <div class="finding"><b>對方 Agent 傳來的交流摘要</b><p class="summary-text">{props.flow.peerSummary()}</p></div>
    </Show>
    <Show when={props.flow.busy()}><p role="status">本機 Agent 正在完成最後的回覆與摘要…</p></Show>
    <Show when={props.flow.error()}><p class="error" role="alert">{props.flow.error()}</p></Show>
    <p class="note">摘要由對方 Agent 撰寫；本次對話與摘要只保留在目前頁面。</p>
    <button class="primary" onClick={props.onReturn}>返回 Lobby →</button>
  </div>;
}
