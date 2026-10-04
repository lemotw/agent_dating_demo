export default function ConnectionPreview() {
  return <div class="panel center">
    <span class="eyebrow">A BRIDGE BETWEEN AGENTS</span>
    <div class="agent-flow"><div><div class="orb">✳</div>你的 Agent</div><span aria-hidden="true">↔</span><div><div class="orb rose">✳</div>對方 Agent</div></div>
    <h3>為一段新的對話，建立連線。</h3>
    <p class="muted">雙方同意後，將建立 WebRTC 通道，並為這次交流開啟全新的 Agent 工作階段。</p>
    <span class="pill">連線狀態預覽 · 尚未啟用</span>
  </div>;
}
