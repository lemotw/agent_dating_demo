import { createSignal, Index, Show } from "solid-js";
import type { LocalAgentProfile, ProfileCandidate } from "../../shared/types";
import { errorMessage } from "../onboarding/interview";
import { saveProfile, toLobbyAgentProfile } from "./profile";

export default function ProfileReview(props: { clientId: string; candidate?: ProfileCandidate; existing?: LocalAgentProfile; onSave: (p: LocalAgentProfile) => Promise<void>; onRegenerate?: () => Promise<void>; busy: boolean }) {
  const [displayName, setDisplayName] = createSignal(props.existing?.displayName ?? "");
  const [agentName, setAgentName] = createSignal(props.existing?.agentName ?? "我的 Agent");
  const [summary, setSummary] = createSignal(props.candidate?.displaySummary ?? props.existing?.publicSummary ?? "");
  const [topics, setTopics] = createSignal((props.candidate?.topics ?? props.existing?.topics ?? []).join("、"));
  const [lookingFor, setLookingFor] = createSignal((props.candidate?.lookingFor ?? props.existing?.lookingFor ?? []).join("、"));
  const [sections, setSections] = createSignal(props.candidate ? props.candidate.sections.map(s => ({ ...s, enabled: false })) : (props.existing?.shareSections ?? []).map(s => ({ ...s, enabled: false })));
  const [consent, setConsent] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");
  const split = (s: string) => s.split(/[、,，\n]/).map(x => x.trim()).filter(Boolean);
  const draft = (): LocalAgentProfile => ({ clientId: props.clientId, displayName: displayName().trim(), agentName: agentName().trim(), publicSummary: summary().trim(), topics: split(topics()), lookingFor: split(lookingFor()), shareSections: sections(), updatedAt: Date.now() });
  const valid = () => { try { toLobbyAgentProfile(draft()); return consent(); } catch { return false; } };
  async function save() {
    if (!valid() || saving() || props.busy) return;
    setSaving(true); setError("");
    try { const profile = saveProfile(draft()); await props.onSave(profile); }
    catch (e) { setError(`名片儲存／工作階段結束失敗：${errorMessage(e)}`); }
    finally { setSaving(false); }
  }
  return <div class="panel review-panel">
    <span class="eyebrow">REVIEW / SHARE ONLY WHAT YOU CHOOSE</span><h2>由你決定公開的名片</h2>
    <p class="small">摘要、話題與交流期待會公開；段落需逐一勾選。請刪除不想分享的內容。未勾選的段落不會儲存或傳送。</p>
    <label for="display-name">你的稱呼<input id="display-name" maxlength={120} value={displayName()} onInput={e => setDisplayName(e.currentTarget.value)} /></label>
    <label for="agent-name">Agent 名稱<input id="agent-name" maxlength={120} value={agentName()} onInput={e => setAgentName(e.currentTarget.value)} /></label>
    <label for="public-summary">公開摘要<textarea id="public-summary" maxlength={4000} value={summary()} onInput={e => setSummary(e.currentTarget.value)} /></label>
    <label for="profile-topics">公開話題（以頓號或逗號分隔）<input id="profile-topics" value={topics()} onInput={e => setTopics(e.currentTarget.value)} /></label>
    <label for="looking-for">公開交流期待（以頓號或逗號分隔）<input id="looking-for" value={lookingFor()} onInput={e => setLookingFor(e.currentTarget.value)} /></label>
    <Index each={sections()}>{(section, index) => <fieldset><legend>{section().label}</legend>
      <label class="checkbox"><input type="checkbox" checked={section().enabled} onChange={e => { const enabled = e.currentTarget.checked; setSections(all => all.map((s, i) => i === index ? { ...s, enabled } : s)); }} />允許公開這個段落</label>
      <label>段落標題<input maxlength={120} value={section().label} onInput={e => { const label = e.currentTarget.value; setSections(all => all.map((s, i) => i === index ? { ...s, label } : s)); }} /></label>
      <label>段落內容<textarea maxlength={4000} value={section().text} onInput={e => { const text = e.currentTarget.value; setSections(all => all.map((s, i) => i === index ? { ...s, text } : s)); }} /></label>
    </fieldset>}</Index>
    <label class="checkbox consent"><input type="checkbox" checked={consent()} onChange={e => setConsent(e.currentTarget.checked)} />我已檢查摘要、話題、交流期待與勾選段落，同意這些內容用於 Lobby 與 Agent 交流。</label>
    <p class="small">需填寫稱呼、Agent 名稱、摘要，至少一個話題或交流期待，以及一個有內容的公開段落。</p>
    <div class="actions"><button class="primary" disabled={!valid() || saving() || props.busy} onClick={() => void save()}>確認分享並儲存，前往 Lobby →</button>
      <Show when={props.onRegenerate}><button disabled={saving() || props.busy} onClick={() => void props.onRegenerate?.()}>重新產生名片</button></Show>
    </div><Show when={props.busy}><p role="status">本機 Agent 正在重新產生名片…</p></Show><Show when={error()}><p class="error" role="alert">{error()}</p></Show>
  </div>;
}
