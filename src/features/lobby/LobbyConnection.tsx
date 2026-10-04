import { createSignal, onCleanup, Show } from 'solid-js';
import { API_ROUTES, PEER_PROTOCOL_VERSION } from '../../shared/constants';

export default function LobbyConnection(props: { clientId: string }) {
  const [status, setStatus] = createSignal('尚未連線');
  const [busy, setBusy] = createSignal(false);
  let socket: WebSocket | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { clearTimeout(timeout); timeout = undefined; };
  onCleanup(() => { clear(); socket?.close(1000, 'Leaving lobby preview'); });

  const connect = () => {
    if (busy() || !props.clientId) return;
    setBusy(true);
    setStatus('正在確認 Lobby 連線…');
    const url = new URL(API_ROUTES.lobby, location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('clientId', props.clientId);
    socket = new WebSocket(url);
    timeout = setTimeout(() => {
      setStatus('連線逾時，請重試'); setBusy(false); socket?.close();
    }, 8000);
    socket.onmessage = (event) => {
      try {
        const message: unknown = JSON.parse(event.data);
        if (message && typeof message === 'object' && 'v' in message && message.v === PEER_PROTOCOL_VERSION && 'type' in message && message.type === 'connected') {
          clear(); setStatus('Lobby 已連線 · 配對功能尚未啟用');
        }
      } catch { clear(); setStatus('收到無法辨識的回應'); setBusy(false); socket?.close(); }
    };
    socket.onerror = () => { clear(); setStatus('連線失敗，請重試'); setBusy(false); };
    socket.onclose = () => {
      clear(); setBusy(false);
      if (status().startsWith('Lobby 已連線') || status().startsWith('正在確認')) setStatus('Lobby 已離線');
    };
  };

  return <div class="connection-check">
    <p role="status" aria-live="polite">{status()}</p>
    <Show when={busy()} fallback={<button onClick={connect} disabled={!props.clientId}>檢查 Lobby 連線</button>}>
      <button onClick={() => socket?.close(1000, 'User disconnected')}>中斷連線</button>
    </Show>
    <p class="note">只送出本機識別碼，不會發佈個人檔案或加入配對。</p>
  </div>;
}
