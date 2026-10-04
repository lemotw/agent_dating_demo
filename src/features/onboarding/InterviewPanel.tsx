import { createSignal, For, Show } from "solid-js";
import { CHECKPOINTS, type InterviewFlow } from "./interview";

export default function InterviewPanel(props: { flow: InterviewFlow; onReview: () => void }) {
  const [answer, setAnswer] = createSignal("");
  async function send(skip = false) { if (await props.flow.answer(answer(), skip)) setAnswer(""); }
  return <div class="panel">
    <span class="eyebrow">PRIVATE / LOCAL AGENT INTERVIEW</span>
    <h2>讓 Agent 認識你的期待</h2>
    <p class="small">六個段落，可隨時略過。訪談不會上傳到 Lobby，也不會存入瀏覽器。</p>
    <progress max={6} value={props.flow.step()} aria-label="訪談進度" />
    <p class="small">已完成 {props.flow.step()} / 6</p>
    <div class="chat interview-history" role="log" aria-live="polite">
      <For each={props.flow.messages()}>{m => <div classList={{ message: true, peer: m.role === "user" }}><small>{m.role === "user" ? "你" : "你的 Agent"}</small>{m.text}</div>}</For>
    </div>
    <Show when={props.flow.step() < 6} fallback={<div class="banner">六個段落已完成。下一步由本機 Agent 整理可審閱的名片。</div>}>
      <h3>{CHECKPOINTS[props.flow.step()]?.label}</h3>
      <label for="interview-answer">{CHECKPOINTS[props.flow.step()]?.question}</label>
      <textarea id="interview-answer" value={answer()} maxlength={8000} disabled={props.flow.busy()} onInput={e => setAnswer(e.currentTarget.value)} />
      <div class="actions"><button class="primary" disabled={props.flow.busy() || !answer().trim()} onClick={() => void send()}>送出回答</button><button disabled={props.flow.busy()} onClick={() => void send(true)}>略過這個段落</button></div>
    </Show>
    <Show when={props.flow.step() === 6}><button class="primary full" disabled={props.flow.busy()} onClick={async () => { if (await props.flow.generate()) props.onReview(); }}>產生／重試名片</button></Show>
    <Show when={props.flow.busy()}><p role="status" class="note">本機 Agent 正在處理，請稍候…</p></Show>
    <Show when={props.flow.error()}><p class="error" role="alert">{props.flow.error()}</p><p class="small">可重試此段落；若本機工作階段中斷，請回到連接頁重新訪談。</p></Show>
  </div>;
}
